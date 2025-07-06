/*
 * workspaceSymbolCache.ts
 * Synchronous workspace symbols caching for LSP.
 *
 * This cache provides persistent storage of workspace symbols to speed up
 * LSP workspace symbol searches without any background processing or threading.
 *
 * Configuration example:
 * {
 *   "basedpyright.analysis.workspaceSymbolsEnabled": true,
 *   "basedpyright.analysis.workspaceSymbolsMaxFiles": 3000,
 *   "basedpyright.analysis.workspaceSymbolsDebug": false,  // Set to true for detailed invalidation logging
 *   "basedpyright.analysis.workspaceSymbolsMaxMemoryMB": 50,  // LRU cache memory limit
 *   "basedpyright.analysis.workspaceSymbolsMaxErrors": 100   // Error threshold before fallback
 * }
 */

import { CancellationToken, SymbolInformation } from 'vscode-languageserver';

import { ProgramView } from '../common/extensibility';
import { Uri } from '../common/uri/uri';
import { SymbolIndexer, IndexSymbolData } from './symbolIndexer';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { getFileInfo } from '../analyzer/analyzerNodeInfo';
import { FileSystem } from '../common/fileSystem';
import { ReadOnlyFileSystem } from '../common/fileSystem';
import { fnv1a } from '../common/fnv1a';
import { ConsoleInterface } from '../common/console';

/**
 * Persisted representation of a workspace-wide symbol cache.
 * Serialized to JSON on disk under <workspace>/.pyright/workspaceSymbolsCache_v1.json
 */
export interface CachedWorkspaceSymbols {
    /** Increment when the on-disk schema changes. */
    version: number;
    /** Aggregated checksum (mtime/hash) so we can detect global invalidation. */
    checksum: string;
    /** Map keyed by file URI (string) containing the file metadata and symbols. */
    files: Record<string, FileIndex>;
}

/**
 * Index entry for a single source file.
 */
export interface FileIndex {
    /** Modified time (milliseconds since epoch). */
    mtime: number;
    /** Hash of file content (first 8KB). */
    hash: string;
    /** Flattened symbols from the file. */
    symbols: IndexedSymbol[];
}

/**
 * Simplified symbol representation for storage.
 */
export interface IndexedSymbol {
    name: string;
    kind: number;
    range: any;
    selectionRange?: any;
    container?: string;
}

/** Options controlling cache behaviour. */
export interface WorkspaceSymbolCacheOptions {
    /** File extension filter; default ['.py', '.pyi'] */
    extensions?: string[];
    /** Maximum symbols to return before short-circuiting search. */
    maxResults?: number;
    /** Maximum number of files to index (most recently modified); default 3000 */
    maxFiles?: number;
    /** Enable verbose logging; default false */
    verbose?: boolean;
    /** Enable debug logging for invalidation and detailed operations; default false */
    debug?: boolean;
    /** Maximum memory usage in MB before LRU eviction; default 50 */
    maxMemoryMB?: number;
    /** Maximum indexing errors before fallback; default 100 */
    maxErrors?: number;
    /** Console interface for logging */
    console?: ConsoleInterface;
    /** Debounce time for batch invalidations in ms; default 50 */
    debounceMs?: number;
    /** Mass invalidation threshold; default 20 */
    massInvalidationThreshold?: number;
}

/** Cache statistics for monitoring and debugging. */
export interface CacheStats {
    workspaceCount: number;
    totalFileCount: number;
    totalSymbolCount: number;
    averageSymbolsPerFile: number;
    cacheHitRate: number;
    memoryUsageMB: number;
    totalErrors: number;
    fallbackActive: boolean;
}

/**
 * Synchronous workspace symbols cache for LSP.
 *
 * This cache provides persistent storage of workspace symbols to speed up
 * LSP workspace symbol searches. All operations are synchronous to avoid
 * background processing complexity.
 */
export class WorkspaceSymbolCache {
    private _cache = new Map<string /* workspaceRoot.key */, CachedWorkspaceSymbols>();
    private _cacheMetadata = new Map<string, { checksum: string; fileCount: number; lastModified: number }>();
    private _cacheQueries = 0; // Track total queries for hit rate calculation
    private _cacheHits = 0; // Track cache hits for hit rate calculation
    private _enabled = true; // Track if caching is enabled
    private _startupCheckComplete = false; // Track startup cache folder detection
    private _buildingCaches = new Set<string>(); // Track workspaces currently building cache

    // LRU cache management
    private _accessOrder = new Map<string, number>(); // Track access order for LRU
    private _accessCounter = 0; // Monotonic counter for access ordering

    // Error handling
    private _errorCount = 0; // Track total errors
    private _fallbackToTraditionalSearch = false; // Flag to fall back when too many errors
    private _lastValidatedCache = new Map<string, number>(); // Track last validation time per workspace

    // Batch invalidation handling
    private _pendingInvalidations = new Map<string, Set<string>>(); // workspace -> set of file URIs
    private _invalidationTimer: any = null;
    private _lastInvalidationBatch = new Map<string, number>(); // Track last batch invalidation time per workspace

    private _options: Required<
        Omit<
            WorkspaceSymbolCacheOptions,
            'console' | 'debug' | 'maxMemoryMB' | 'maxErrors' | 'debounceMs' | 'massInvalidationThreshold'
        >
    > &
        Pick<
            WorkspaceSymbolCacheOptions,
            'console' | 'debug' | 'maxMemoryMB' | 'maxErrors' | 'debounceMs' | 'massInvalidationThreshold'
        >;
    private _console?: ConsoleInterface;

    constructor(options?: WorkspaceSymbolCacheOptions) {
        this._options = {
            extensions: options?.extensions ?? ['.py', '.pyi'],
            maxResults: options?.maxResults ?? 500,
            maxFiles: options?.maxFiles ?? 3000,
            verbose: options?.verbose ?? false,
            debug: options?.debug ?? false,
            maxMemoryMB: options?.maxMemoryMB ?? 50,
            maxErrors: options?.maxErrors ?? 100,
            debounceMs: options?.debounceMs ?? 50,
            massInvalidationThreshold: options?.massInvalidationThreshold ?? 20,
            console: options?.console ?? undefined,
        };
        this._console = options?.console;
    }

    /**
     * Configure the cache with server settings.
     */
    configure(
        enabled: boolean,
        maxFiles: number,
        verbose: boolean = false,
        debug: boolean = false,
        console?: ConsoleInterface
    ): void {
        this._enabled = enabled;
        this._options.maxFiles = maxFiles;
        this._options.verbose = verbose;
        this._options.debug = debug;
        this._console = console || this._console;

        // If caching is disabled, clear existing caches
        if (!enabled) {
            this._cache.clear();
            this._cacheMetadata.clear();
            this._log('Workspace symbols caching disabled - cleared existing caches');
        } else {
            this._log(`Workspace symbols caching enabled (max ${maxFiles} files, verbose=${verbose}, debug=${debug})`);
        }
    }

    /**
     * Update cache options (useful for runtime configuration).
     */
    setOptions(options: Partial<WorkspaceSymbolCacheOptions>): void {
        this._options = {
            ...this._options,
            ...options,
        };
        if (options.console) {
            this._console = options.console;
        }
    }

    /**
     * Check cache folder existence at startup and report status.
     */
    checkCacheFolderAtStartup(workspaceRoot: Uri, fs: ReadOnlyFileSystem): void {
        if (this._startupCheckComplete) {
            return;
        }

        const cacheDir = workspaceRoot.combinePaths('.pyright');
        const cacheFile = this._getCacheFileUri(workspaceRoot);

        try {
            const cacheDirExists = fs.existsSync(cacheDir);
            const cacheFileExists = fs.existsSync(cacheFile);

            if (cacheDirExists && cacheFileExists) {
                try {
                    const stats = fs.statSync(cacheFile);
                    const lastModified = stats ? new Date(stats.mtimeMs).toISOString() : 'unknown';
                    this._log(
                        `Found existing workspace symbols cache at ${cacheFile.toUserVisibleString()} (last modified: ${lastModified})`
                    );
                } catch {
                    this._log(`Found workspace symbols cache at ${cacheFile.toUserVisibleString()}`);
                }
            } else if (cacheDirExists) {
                this._log(`Cache directory exists at ${cacheDir.toUserVisibleString()}, but no cache file found`);
            } else {
                this._log(`No workspace symbols cache found - will create at ${cacheDir.toUserVisibleString()}`);
            }
        } catch (error) {
            this._log(`Error checking cache folder: ${error}`);
        }

        this._startupCheckComplete = true;
    }

    /**
     * Build or refresh the cache for a workspace synchronously.
     * @param forceRebuild When true, rebuilds all files. When false, only rebuilds files that have changed.
     */
    cacheWorkspaceSymbols(
        workspaceRoot: Uri,
        program: ProgramView,
        forceRebuild = false,
        token: CancellationToken = CancellationToken.None
    ): void {
        // If caching is disabled, do nothing
        if (!this._enabled) {
            return;
        }

        const workspaceKey = workspaceRoot.key;

        // Prevent multiple concurrent cache builds for the same workspace
        if (this._buildingCaches.has(workspaceKey)) {
            this._debugLog(`Skipping cache build for ${workspaceRoot.toUserVisibleString()} - already building`);
            return;
        }

        // Check cache folder at startup
        this.checkCacheFolderAtStartup(workspaceRoot, program.fileSystem);

        const existingCache = this._cache.get(workspaceKey) || this._loadFromDisk(workspaceRoot, program.fileSystem);

        // If we have existing cache and not forcing rebuild, just reuse it entirely
        if (existingCache && !forceRebuild) {
            if (this._options.verbose) {
                const fileCount = Object.keys(existingCache.files).length;
                const symbolCount = Object.values(existingCache.files).reduce(
                    (sum, file) => sum + file.symbols.length,
                    0
                );
                this._log(`Reusing existing cache: ${fileCount} files, ${symbolCount} symbols`);
            }

            // Store metadata for fast access
            const maxMtime = Math.max(...Object.values(existingCache.files).map((f) => f.mtime));
            this._cacheMetadata.set(workspaceKey, {
                checksum: existingCache.checksum,
                fileCount: Object.keys(existingCache.files).length,
                lastModified: maxMtime,
            });

            this._cache.set(workspaceKey, existingCache);
            return;
        }

        // Mark as building to prevent concurrent builds and invalidation
        this._buildingCaches.add(workspaceKey);

        try {
            const startTime = Date.now();
            const newFiles: Record<string, FileIndex> = {};

            // Get all source files with optimized filtering
            const allFiles = program
                .getSourceFileInfoList()
                .filter((fileInfo) => {
                    // Fast file filtering before expensive operations
                    if (!this._shouldIndexFile(fileInfo.uri)) {
                        return false;
                    }

                    const parseResults = program.getParseResults(fileInfo.uri);
                    if (!parseResults) return false;
                    const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
                    return !!analyzerFileInfo;
                })
                .map((fileInfo) => ({
                    fileInfo,
                    stat: program.fileSystem.statSync(fileInfo.uri),
                }))
                .sort((a, b) => (b.stat?.mtimeMs || 0) - (a.stat?.mtimeMs || 0)) // Most recent first
                .slice(0, this._options.maxFiles); // Limit to maxFiles

            if (this._options.verbose) {
                this._log(`Indexing ${allFiles.length} most recent files (limit: ${this._options.maxFiles})`);
            }

            let reusedCount = 0;
            let rebuiltCount = 0;
            let errorCount = 0;

            for (const { fileInfo, stat } of allFiles) {
                try {
                    throwIfCancellationRequested(token);

                    const parseResults = program.getParseResults(fileInfo.uri);
                    if (!parseResults) continue;

                    const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
                    if (!analyzerFileInfo) continue;

                    const fileUriStr = fileInfo.uri.toString();
                    const mtime = stat?.mtimeMs || 0;

                    // Get file content hash for change detection
                    const bytes = program.fileSystem.readFileSync(fileInfo.uri, null).subarray(0, 8192);
                    const currentHash = fnv1a(bytes);

                    // Check if we can reuse existing cache entry
                    const existingFile = existingCache?.files[fileUriStr];

                    if (!forceRebuild && existingFile) {
                        // Compare hash first (most reliable), then mtime as fallback
                        if (existingFile.hash === currentHash || (existingFile.mtime === mtime && existingFile.hash)) {
                            // File hasn't changed, reuse cached symbols
                            newFiles[fileUriStr] = {
                                ...existingFile,
                                mtime, // Update mtime to current value
                                hash: currentHash, // Update hash to current value
                            };
                            reusedCount++;
                            continue;
                        }
                    }

                    // File changed, doesn't exist in cache, or force rebuild - need to recompute symbols
                    const symbols = SymbolIndexer.indexSymbols(
                        analyzerFileInfo,
                        parseResults,
                        { includeAliases: false },
                        token ?? CancellationToken.None
                    );

                    // Flatten & convert to serializable form
                    const flat: IndexedSymbol[] = this._flattenIndexedSymbols(symbols, '');

                    newFiles[fileUriStr] = {
                        mtime,
                        hash: currentHash,
                        symbols: flat,
                    };

                    rebuiltCount++;
                } catch (error) {
                    errorCount++;
                    this._handleIndexingError(
                        workspaceRoot,
                        error as Error,
                        `indexing file ${fileInfo.uri.toUserVisibleString()}`
                    );
                }
            }

            const elapsedTime = Date.now() - startTime;
            if (this._options.verbose) {
                this._log(
                    `Indexing completed in ${elapsedTime}ms: ${reusedCount} reused, ${rebuiltCount} rebuilt${
                        errorCount > 0 ? `, ${errorCount} errors` : ''
                    }`
                );
            }

            // Check if we should store partial cache on high error count
            if (errorCount > 0 && errorCount >= allFiles.length * 0.3) {
                this._storePartialCache(workspaceRoot, newFiles, program.fileSystem);
                return;
            }

            // Compute overall checksum for the workspace
            const checksumData = Object.keys(newFiles)
                .sort()
                .map((uri) => {
                    const file = newFiles[uri];
                    return `${uri}:${file.mtime}:${file.hash}`;
                })
                .join('|');
            const checksum = fnv1a(new TextEncoder().encode(checksumData));

            const cached: CachedWorkspaceSymbols = {
                version: 1,
                checksum,
                files: newFiles,
            };

            // Store metadata for fast access
            const maxMtime = Math.max(...Object.values(newFiles).map((f) => f.mtime));
            this._cacheMetadata.set(workspaceKey, {
                checksum,
                fileCount: Object.keys(newFiles).length,
                lastModified: maxMtime,
            });

            this._cache.set(workspaceKey, cached);
            this._trackAccess(workspaceKey);
            this._evictLRU(); // Check if we need to evict old caches
            this._saveToDisk(workspaceRoot, cached, program.fileSystem);
        } catch (error) {
            this._handleIndexingError(workspaceRoot, error as Error, 'cache building');
            throw error;
        } finally {
            // Always clean up building state
            this._buildingCaches.delete(workspaceKey);
        }
    }

    /**
     * Update the cache incrementally - check files for changes and only rebuild changed ones.
     */
    updateWorkspaceSymbols(
        workspaceRoot: Uri,
        program: ProgramView,
        token: CancellationToken = CancellationToken.None
    ): void {
        // If caching is disabled, do nothing
        if (!this._enabled) {
            return;
        }

        const workspaceKey = workspaceRoot.key;

        // Prevent multiple concurrent cache updates for the same workspace
        if (this._buildingCaches.has(workspaceKey)) {
            this._debugLog(`Skipping cache update for ${workspaceRoot.toUserVisibleString()} - already building`);
            return;
        }

        // Check cache folder at startup
        this.checkCacheFolderAtStartup(workspaceRoot, program.fileSystem);

        const existingCache = this._cache.get(workspaceKey) || this._loadFromDisk(workspaceRoot, program.fileSystem);

        // If no existing cache, fall back to full rebuild
        if (!existingCache) {
            if (this._options.verbose) {
                this._log('No existing cache found, performing full rebuild...');
            }
            this.cacheWorkspaceSymbols(workspaceRoot, program, true, token);
            return;
        }

        // Fast check: if we have pending invalidations that suggest workspace-wide changes,
        // just do a full rebuild instead of incremental update
        const pendingFiles = this._pendingInvalidations.get(workspaceKey);
        if (pendingFiles && this._isWorkspaceWideChange(pendingFiles)) {
            this._debugLog('Workspace-wide change detected during update, switching to full rebuild');
            this._pendingInvalidations.delete(workspaceKey);
            this.cacheWorkspaceSymbols(workspaceRoot, program, true, token);
            return;
        }

        // Mark as building to prevent concurrent builds and invalidation
        this._buildingCaches.add(workspaceKey);

        try {
            const startTime = Date.now();
            const totalFiles = Object.keys(existingCache.files).length;

            if (this._options.verbose) {
                this._log(`Incrementally updating cache with ${totalFiles} files...`);
            }

            const newFiles: Record<string, FileIndex> = {};
            let reusedCount = 0;
            let rebuiltCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            // Cache frequently used URIs to avoid repeated parsing
            const uriCache = new Map<string, Uri>();

            // Process all files - optimized for speed
            for (const [fileUriStr, existingFile] of Object.entries(existingCache.files)) {
                try {
                    throwIfCancellationRequested(token);

                    // Use cached URI or parse once
                    let fileUri = uriCache.get(fileUriStr);
                    if (!fileUri) {
                        fileUri = Uri.parse(fileUriStr, program.serviceProvider);
                        uriCache.set(fileUriStr, fileUri);
                    }

                    // Fast file filtering - skip files that shouldn't be indexed
                    if (!this._shouldIndexFile(fileUri)) {
                        skippedCount++;
                        continue;
                    }

                    // Quick stat check - if file doesn't exist anymore, skip it
                    const stat = program.fileSystem.statSync(fileUri);
                    if (!stat) {
                        skippedCount++;
                        continue;
                    }

                    const mtime = stat.mtimeMs || 0;

                    // Fast path: if mtime hasn't changed, reuse immediately (most common case)
                    if (existingFile.mtime === mtime) {
                        newFiles[fileUriStr] = existingFile;
                        reusedCount++;
                        continue;
                    }

                    // mtime changed - check if content actually changed (expensive path)
                    const bytes = program.fileSystem.readFileSync(fileUri, null).subarray(0, 8192);
                    const currentHash = fnv1a(bytes);

                    if (existingFile.hash === currentHash) {
                        // Content unchanged, just mtime changed - reuse symbols
                        newFiles[fileUriStr] = {
                            ...existingFile,
                            mtime, // Update mtime
                        };
                        reusedCount++;
                        continue;
                    }

                    // Content changed - need to rebuild (most expensive path)
                    const parseResults = program.getParseResults(fileUri);
                    if (!parseResults) continue;

                    const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
                    if (!analyzerFileInfo) continue;

                    const symbols = SymbolIndexer.indexSymbols(
                        analyzerFileInfo,
                        parseResults,
                        { includeAliases: false },
                        token ?? CancellationToken.None
                    );

                    const flat: IndexedSymbol[] = this._flattenIndexedSymbols(symbols, '');

                    newFiles[fileUriStr] = {
                        mtime,
                        hash: currentHash,
                        symbols: flat,
                    };

                    rebuiltCount++;
                } catch (error) {
                    // File might have been deleted or become inaccessible
                    errorCount++;
                    if (this._options.verbose) {
                        this._log(`Error updating file ${fileUriStr}: ${error}`);
                    }
                    skippedCount++;
                    continue;
                }
            }

            // After processing existing cached files, index any **new** files that were not previously cached.
            // This prevents the cache from being invalidated wholesale when large numbers of new files are added.

            // Identify and index new files that were not in the previous cache.
            for (const fileInfo of program.getSourceFileInfoList()) {
                const fileUriStr = fileInfo.uri.toString();

                // Skip files we already handled above.
                if (newFiles[fileUriStr]) {
                    continue;
                }

                // Respect file-filtering rules.
                if (!this._shouldIndexFile(fileInfo.uri)) {
                    continue;
                }

                try {
                    throwIfCancellationRequested(token);

                    const stat = program.fileSystem.statSync(fileInfo.uri);
                    if (!stat) {
                        // File might have been removed after program snapshot.
                        skippedCount++;
                        continue;
                    }

                    const mtime = stat.mtimeMs || 0;
                    const bytes = program.fileSystem.readFileSync(fileInfo.uri, null).subarray(0, 8192);
                    const currentHash = fnv1a(bytes);

                    // Build symbols for the new file.
                    const parseResults = program.getParseResults(fileInfo.uri);
                    if (!parseResults) {
                        skippedCount++;
                        continue;
                    }

                    const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
                    if (!analyzerFileInfo) {
                        skippedCount++;
                        continue;
                    }

                    const symbols = SymbolIndexer.indexSymbols(
                        analyzerFileInfo,
                        parseResults,
                        { includeAliases: false },
                        token ?? CancellationToken.None
                    );

                    const flat: IndexedSymbol[] = this._flattenIndexedSymbols(symbols, '');

                    newFiles[fileUriStr] = {
                        mtime,
                        hash: currentHash,
                        symbols: flat,
                    };

                    rebuiltCount++;
                } catch (error) {
                    errorCount++;
                    if (this._options.verbose) {
                        this._log(`Error indexing new file ${fileUriStr}: ${error}`);
                    }
                    skippedCount++;
                    continue;
                }
            }

            // Enforce maxFiles limit – prune the oldest files (by mtime) if we exceed it.
            const currentFileCount = Object.keys(newFiles).length;
            if (currentFileCount > this._options.maxFiles) {
                const toPrune = currentFileCount - this._options.maxFiles;
                const sortedByMtime = Object.entries(newFiles).sort(
                    ([_aUri, a], [_bUri, b]) => (b.mtime || 0) - (a.mtime || 0)
                );

                for (let i = sortedByMtime.length - 1; i >= sortedByMtime.length - toPrune; i--) {
                    const [uri] = sortedByMtime[i];
                    delete newFiles[uri];
                    skippedCount++;
                }
            }

            const elapsedTime = Date.now() - startTime;
            if (this._options.verbose) {
                this._log(
                    `Update completed in ${elapsedTime}ms: ${reusedCount} reused, ${rebuiltCount} rebuilt, ${skippedCount} skipped${
                        errorCount > 0 ? `, ${errorCount} errors` : ''
                    }`
                );
            }

            // Handle case where no files remain (all deleted or skipped)
            if (Object.keys(newFiles).length === 0) {
                if (this._options.verbose) {
                    this._log('No files remain - clearing cache');
                }
                this._cache.delete(workspaceKey);
                this._cacheMetadata.delete(workspaceKey);
                return;
            }

            // Compute overall checksum for the workspace
            const checksumData = Object.keys(newFiles)
                .sort()
                .map((uri) => {
                    const file = newFiles[uri];
                    return `${uri}:${file.mtime}:${file.hash}`;
                })
                .join('|');
            const checksum = fnv1a(new TextEncoder().encode(checksumData));

            const cached: CachedWorkspaceSymbols = {
                version: 1,
                checksum,
                files: newFiles,
            };

            // Store metadata for fast access
            const maxMtime = Math.max(...Object.values(newFiles).map((f) => f.mtime));
            this._cacheMetadata.set(workspaceKey, {
                checksum,
                fileCount: Object.keys(newFiles).length,
                lastModified: maxMtime,
            });

            this._cache.set(workspaceKey, cached);
            this._saveToDisk(workspaceRoot, cached, program.fileSystem);
        } catch (error) {
            if (this._options.verbose) {
                this._log(`Error during cache update for ${workspaceRoot.toUserVisibleString()}: ${error}`);
            }
            throw error;
        } finally {
            // Always clean up building state
            this._buildingCaches.delete(workspaceKey);
        }
    }

    /**
     * Search for symbols matching the query.
     * Returns cached results if available, otherwise returns empty array.
     */
    search(
        workspaceRoot: Uri,
        program: ProgramView,
        query: string,
        token: CancellationToken = CancellationToken.None
    ): SymbolInformation[] {
        // If caching is disabled or fallback is active, return empty results to fall back to traditional search
        if (!this._enabled || this._fallbackToTraditionalSearch) {
            return [];
        }

        this._cacheQueries++;

        // Check if we have cache in memory
        let cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            // Try to load from disk
            cached = this._loadFromDisk(workspaceRoot, program.fileSystem);
            if (cached) {
                this._cache.set(workspaceRoot.key, cached);

                // Store metadata for fast access
                const maxMtime = Math.max(...Object.values(cached.files).map((f) => f.mtime));
                this._cacheMetadata.set(workspaceRoot.key, {
                    checksum: cached.checksum,
                    fileCount: Object.keys(cached.files).length,
                    lastModified: maxMtime,
                });

                if (this._options.verbose) {
                    this._log(`Loaded cache from disk: ${Object.keys(cached.files).length} files`);
                }
            }
        }

        // If no cache available, return empty results
        if (!cached) {
            return [];
        }

        // Track access for LRU
        this._trackAccess(workspaceRoot.key);

        // Search the cache
        this._cacheHits++;
        const results = this._searchCache(cached, query);

        if (this._options.verbose) {
            this._log(`Search results: ${results.length} symbols found for query "${query}"`);
        }

        return results;
    }

    /**
     * Get cache statistics for monitoring and debugging.
     */
    getCacheStats(): CacheStats {
        let totalFiles = 0;
        let totalSymbols = 0;
        let workspaceCount = 0;

        for (const cached of this._cache.values()) {
            workspaceCount++;
            totalFiles += Object.keys(cached.files).length;
            for (const fileIndex of Object.values(cached.files)) {
                totalSymbols += fileIndex.symbols.length;
            }
        }

        return {
            workspaceCount,
            totalFileCount: totalFiles,
            totalSymbolCount: totalSymbols,
            averageSymbolsPerFile: totalFiles > 0 ? Math.round(totalSymbols / totalFiles) : 0,
            cacheHitRate: this._cacheQueries > 0 ? this._cacheHits / this._cacheQueries : 0,
            memoryUsageMB: this._estimateMemoryUsage(),
            totalErrors: this._errorCount,
            fallbackActive: this._fallbackToTraditionalSearch,
        };
    }

    /**
     * Clear all caches (useful for testing or memory management).
     */
    clearAllCaches(): void {
        this._cache.clear();
        this._cacheMetadata.clear();
        this._buildingCaches.clear();
        this._accessOrder.clear();
        this._lastValidatedCache.clear();
        this._pendingInvalidations.clear();
        this._lastInvalidationBatch.clear();
        if (this._invalidationTimer) {
            clearTimeout(this._invalidationTimer);
            this._invalidationTimer = null;
        }
        this._cacheQueries = 0;
        this._cacheHits = 0;
        this._accessCounter = 0;
        this._errorCount = 0;
        this._fallbackToTraditionalSearch = false;
        this._log('Cleared all workspace symbol caches');
    }

    /** Mark a file or entire workspace as dirty. */
    invalidate(workspaceRoot: Uri, fileUri?: Uri) {
        // If caching is disabled, do nothing
        if (!this._enabled) {
            return;
        }

        const key = workspaceRoot.key;

        // Don't invalidate if cache is currently being built
        if (this._buildingCaches.has(key)) {
            const target = fileUri
                ? `file ${fileUri.toUserVisibleString()}`
                : `workspace ${workspaceRoot.toUserVisibleString()}`;
            this._debugLog(`Skipping invalidation for ${target} - cache is currently being built`);
            return;
        }

        if (!fileUri) {
            // Invalidate entire workspace
            const hasCache = this._cache.has(key) || this._cacheMetadata.has(key);
            if (hasCache) {
                if (this._options.verbose) {
                    this._log(`Invalidating entire workspace: ${workspaceRoot.toUserVisibleString()}`);
                }
                this._cache.delete(key);
                this._cacheMetadata.delete(key);
                this._accessOrder.delete(key);
                this._lastValidatedCache.delete(key);
                this._pendingInvalidations.delete(key);
            } else {
                this._debugLog(
                    `Skipping invalidation for workspace ${workspaceRoot.toUserVisibleString()} - no cache exists`
                );
            }
        } else {
            // Skip files that shouldn't be indexed for performance
            if (!this._shouldIndexFile(fileUri)) {
                this._debugLog(`Skipping invalidation for non-indexable file: ${fileUri.toUserVisibleString()}`);
                return;
            }

            // Check if this is a duplicate invalidation (same file invalidated multiple times quickly)
            const fileUriStr = fileUri.toString();
            const pendingFiles = this._pendingInvalidations.get(key);
            if (pendingFiles && pendingFiles.has(fileUriStr)) {
                this._debugLog(`Skipping duplicate invalidation for ${fileUri.toUserVisibleString()}`);
                return;
            }

            // Invalidate specific file - use batch processing for better performance
            this._batchInvalidateFile(workspaceRoot, fileUri);
        }
    }

    /** Force immediate processing of pending invalidations. */
    flushPendingInvalidations(): void {
        if (this._invalidationTimer) {
            clearTimeout(this._invalidationTimer);
            this._invalidationTimer = null;
        }
        this._processBatchInvalidations();
    }

    /**
     * Return cached symbols for a workspace if already present in memory. Does not perform any disk I/O.
     */
    getCachedSymbols(workspaceRoot: Uri): CachedWorkspaceSymbols | undefined {
        return this._cache.get(workspaceRoot.key);
    }

    /** Check if file should be included in symbol indexing for performance. */
    private _shouldIndexFile(fileUri: Uri): boolean {
        const filePath = fileUri.toUserVisibleString();

        // Skip common build/generated file patterns for performance
        const skipPatterns = [
            '__pycache__/',
            '.git/',
            'node_modules/',
            '.venv/',
            '.env/',
            'venv/',
            'env/',
            '.tox/',
            '.pytest_cache/',
            '.mypy_cache/',
            'build/',
            'dist/',
            '.egg-info/',
            '_pb2.py',
            '_pb2_grpc.py',
            '.generated.py',
            '.min.js',
            '.bundle.js',
        ];

        // Quick pattern matching for performance
        for (const pattern of skipPatterns) {
            if (filePath.includes(pattern)) {
                return false;
            }
        }

        // Check file extension
        const lowerPath = filePath.toLowerCase();
        return this._options.extensions.some((ext) => lowerPath.endsWith(ext));
    }

    /**
     * Flatten indexed symbols into a serializable format.
     */
    private _flattenIndexedSymbols(symbols: IndexSymbolData[], container: string): IndexedSymbol[] {
        const result: IndexedSymbol[] = [];
        for (const symbol of symbols) {
            result.push({
                name: symbol.name,
                kind: symbol.kind,
                range: symbol.range,
                selectionRange: symbol.selectionRange,
                container,
            });
            if (symbol.children) {
                result.push(...this._flattenIndexedSymbols(symbol.children, symbol.name));
            }
        }
        return result;
    }

    private _getCacheFileUri(workspaceRoot: Uri): Uri {
        return workspaceRoot.combinePaths('.pyright', 'workspaceSymbolsCache_v1.json');
    }

    private _loadFromDisk(workspaceRoot: Uri, fs: ReadOnlyFileSystem): CachedWorkspaceSymbols | undefined {
        const fileUri = this._getCacheFileUri(workspaceRoot);
        if (!fs.existsSync(fileUri)) return undefined;

        try {
            const text = fs.readFileSync(fileUri, 'utf8');
            const obj = JSON.parse(text);
            if (obj.version === 1 && obj.files) {
                const cached = obj as CachedWorkspaceSymbols;

                // Validate cache integrity
                if (!this._validateCache(cached, workspaceRoot.key)) {
                    this._log(
                        `Cache validation failed for ${workspaceRoot.toUserVisibleString()}, ignoring cached data`
                    );
                    return undefined;
                }

                return cached;
            }
        } catch (error) {
            this._log(`Error reading cache file ${fileUri.toUserVisibleString()}: ${error}`);
        }
        return undefined;
    }

    private _saveToDisk(workspaceRoot: Uri, cached: CachedWorkspaceSymbols, fs: ReadOnlyFileSystem) {
        const dirUri = workspaceRoot.combinePaths('.pyright');
        if (FileSystem.is(fs)) {
            if (!fs.existsSync(dirUri)) {
                try {
                    fs.mkdirSync(dirUri, { recursive: true });
                    if (this._options.verbose) {
                        this._log(`Created cache directory: ${dirUri.toUserVisibleString()}`);
                    }
                } catch (error) {
                    if (this._options.verbose) {
                        this._log(`Error creating cache directory ${dirUri.toUserVisibleString()}: ${error}`);
                    }
                }
            }

            const fileUri = this._getCacheFileUri(workspaceRoot);
            try {
                fs.writeFileSync(fileUri, JSON.stringify(cached), null);
                if (this._options.verbose) {
                    this._log(`Saved cache to disk: ${fileUri.toUserVisibleString()}`);
                }
            } catch (error) {
                if (this._options.verbose) {
                    this._log(`Error saving cache to ${fileUri.toUserVisibleString()}: ${error}`);
                }
            }
        }
    }

    private _searchCache(cached: CachedWorkspaceSymbols, query: string): SymbolInformation[] {
        const result: SymbolInformation[] = [];
        const lowerQuery = query.toLowerCase();

        for (const [fileUriStr, fileIndex] of Object.entries(cached.files)) {
            for (const sym of fileIndex.symbols) {
                if (!sym.name.toLowerCase().includes(lowerQuery)) {
                    continue;
                }
                const symbolInfo: SymbolInformation = {
                    name: sym.name,
                    kind: sym.kind as any,
                    location: {
                        uri: fileUriStr,
                        range: sym.selectionRange ?? sym.range,
                    },
                    containerName: sym.container,
                };
                result.push(symbolInfo);
                if (result.length >= this._options.maxResults) {
                    return result;
                }
            }
        }

        return result;
    }

    private _log(message: string): void {
        if (this._console) {
            this._console.info(`Workspace symbols: ${message}`);
        } else if (this._options.verbose) {
            console.log(`Workspace symbols: ${message}`);
        }
    }

    private _debugLog(message: string): void {
        if (this._options.debug) {
            if (this._console) {
                this._console.info(`Workspace symbols [DEBUG]: ${message}`);
            } else {
                console.log(`Workspace symbols [DEBUG]: ${message}`);
            }
        }
    }

    /**
     * Track access for LRU cache management.
     */
    private _trackAccess(workspaceKey: string): void {
        this._accessOrder.set(workspaceKey, ++this._accessCounter);
    }

    /**
     * Estimate memory usage of cached data in MB.
     */
    private _estimateMemoryUsage(): number {
        let totalBytes = 0;
        for (const [key, cached] of this._cache) {
            // Rough estimation: key + JSON size
            totalBytes += key.length * 2; // UTF-16 encoding
            totalBytes += JSON.stringify(cached).length * 2; // Rough JSON size
        }
        return totalBytes / (1024 * 1024); // Convert to MB
    }

    /**
     * Evict least recently used caches to free memory.
     */
    private _evictLRU(): void {
        const memoryUsage = this._estimateMemoryUsage();
        const maxMemory = this._options.maxMemoryMB || 50;

        if (memoryUsage <= maxMemory) {
            return;
        }

        // Sort by access order (oldest first)
        const sortedEntries = Array.from(this._accessOrder.entries()).sort((a, b) => a[1] - b[1]);

        let evicted = 0;
        for (const [workspaceKey] of sortedEntries) {
            if (this._estimateMemoryUsage() <= maxMemory * 0.8) {
                break; // Leave some headroom
            }

            this._cache.delete(workspaceKey);
            this._cacheMetadata.delete(workspaceKey);
            this._accessOrder.delete(workspaceKey);
            this._lastValidatedCache.delete(workspaceKey);
            evicted++;
        }

        if (evicted > 0 && this._options.verbose) {
            this._log(
                `Evicted ${evicted} LRU cache entries to free memory (${memoryUsage.toFixed(
                    1
                )}MB -> ${this._estimateMemoryUsage().toFixed(1)}MB)`
            );
        }
    }

    /**
     * Validate cache integrity and handle corruption.
     */
    private _validateCache(cached: CachedWorkspaceSymbols, workspaceKey: string): boolean {
        try {
            // Basic structural validation
            if (!cached.files || typeof cached.files !== 'object') {
                this._log(`Cache validation failed for ${workspaceKey}: Invalid files structure`);
                return false;
            }

            if (!cached.checksum || typeof cached.checksum !== 'string') {
                this._log(`Cache validation failed for ${workspaceKey}: Invalid checksum`);
                return false;
            }

            // Check for empty cache
            if (Object.keys(cached.files).length === 0) {
                this._debugLog(`Cache validation warning for ${workspaceKey}: Empty cache`);
                return true; // Empty cache is valid
            }

            // Validate file entries
            for (const [uri, fileIndex] of Object.entries(cached.files)) {
                if (!fileIndex.symbols || !Array.isArray(fileIndex.symbols)) {
                    this._log(`Cache validation failed for ${workspaceKey}: Invalid symbols for ${uri}`);
                    return false;
                }

                if (typeof fileIndex.mtime !== 'number' || typeof fileIndex.hash !== 'string') {
                    this._log(`Cache validation failed for ${workspaceKey}: Invalid metadata for ${uri}`);
                    return false;
                }
            }

            // Update last validation time
            this._lastValidatedCache.set(workspaceKey, Date.now());
            return true;
        } catch (error) {
            this._log(`Cache validation error for ${workspaceKey}: ${error}`);
            return false;
        }
    }

    /**
     * Handle indexing errors with graceful degradation.
     */
    private _handleIndexingError(workspaceRoot: Uri, error: Error, context: string): void {
        this._errorCount++;

        if (this._options.verbose) {
            this._log(`Indexing error in ${context} for ${workspaceRoot.toUserVisibleString()}: ${error.message}`);
        }

        // If too many errors, fall back to traditional search
        if (this._errorCount > (this._options.maxErrors || 100)) {
            this._fallbackToTraditionalSearch = true;
            this._log(`Too many indexing errors (${this._errorCount}), falling back to traditional search`);

            // Clear caches to prevent further issues
            this.clearAllCaches();
        }
    }

    /**
     * Store partial cache on error to preserve work done.
     */
    private _storePartialCache(
        workspaceRoot: Uri,
        partialFiles: Record<string, FileIndex>,
        fileSystem: ReadOnlyFileSystem
    ): void {
        if (Object.keys(partialFiles).length === 0) {
            return;
        }

        try {
            // Compute checksum for partial data
            const checksumData = Object.keys(partialFiles)
                .sort()
                .map((uri) => {
                    const file = partialFiles[uri];
                    return `${uri}:${file.mtime}:${file.hash}`;
                })
                .join('|');
            const checksum = fnv1a(new TextEncoder().encode(checksumData));

            const partialCache: CachedWorkspaceSymbols = {
                version: 1,
                checksum,
                files: partialFiles,
            };

            // Store partial cache
            this._cache.set(workspaceRoot.key, partialCache);
            this._saveToDisk(workspaceRoot, partialCache, fileSystem);

            if (this._options.verbose) {
                this._log(`Stored partial cache with ${Object.keys(partialFiles).length} files`);
            }
        } catch (error) {
            this._log(`Failed to store partial cache: ${error}`);
        }
    }

    /**
     * Recover from cache corruption by rebuilding.
     */
    private _recoverFromCorruption(workspaceRoot: Uri, program: ProgramView): void {
        const workspaceKey = workspaceRoot.key;

        this._log(`Recovering from cache corruption for ${workspaceRoot.toUserVisibleString()}`);

        // Clear corrupted cache
        this._cache.delete(workspaceKey);
        this._cacheMetadata.delete(workspaceKey);
        this._accessOrder.delete(workspaceKey);
        this._lastValidatedCache.delete(workspaceKey);

        // Try to delete corrupted disk cache
        try {
            const cacheFile = this._getCacheFileUri(workspaceRoot);
            if (program.fileSystem.existsSync(cacheFile)) {
                // ReadOnlyFileSystem doesn't have unlinkSync, so we'll just log and continue
                this._log(`Corrupted cache file found at ${cacheFile.toUserVisibleString()}, will be overwritten`);
            }
        } catch (error) {
            this._log(`Failed to check corrupted cache file: ${error}`);
        }

        // Rebuild cache
        try {
            this.cacheWorkspaceSymbols(workspaceRoot, program, true);
        } catch (error) {
            this._handleIndexingError(workspaceRoot, error as Error, 'cache recovery');
        }
    }

    /**
     * Process all pending invalidations in batches.
     */
    private _processBatchInvalidations(): void {
        for (const [workspaceKey, pendingFiles] of this._pendingInvalidations.entries()) {
            if (pendingFiles.size === 0) continue;

            // Check if cache is currently being built
            if (this._buildingCaches.has(workspaceKey)) {
                this._debugLog(
                    `Skipping batch invalidation for workspace ${workspaceKey} - cache is currently being built`
                );
                continue;
            }

            const cached = this._cache.get(workspaceKey);
            if (!cached) {
                this._debugLog(`Skipping batch invalidation for workspace ${workspaceKey} - no cache exists`);
                continue;
            }

            // Check if this looks like a workspace-wide change
            if (this._isWorkspaceWideChange(pendingFiles)) {
                // Clear entire workspace cache for efficiency
                this._cache.delete(workspaceKey);
                this._cacheMetadata.delete(workspaceKey);
                this._accessOrder.delete(workspaceKey);
                this._lastValidatedCache.delete(workspaceKey);

                this._log(
                    `Workspace-wide change detected (${pendingFiles.size} files), cleared entire cache for rebuild`
                );
                this._lastInvalidationBatch.set(workspaceKey, Date.now());
                continue;
            }

            let actualInvalidations = 0;
            let skippedFiles = 0;

            // Process each file in the batch individually
            for (const fileUriStr of pendingFiles) {
                if (cached.files[fileUriStr]) {
                    delete cached.files[fileUriStr];
                    actualInvalidations++;
                } else {
                    skippedFiles++;
                }
            }

            // Log batch results
            if (actualInvalidations > 0) {
                // Mark metadata as stale by removing it
                this._cacheMetadata.delete(workspaceKey);

                // Check if this looks like a mass invalidation (lots of files at once)
                const isMassInvalidation = actualInvalidations > (this._options.massInvalidationThreshold || 20);
                const lastBatchTime = this._lastInvalidationBatch.get(workspaceKey) || 0;
                const timeSinceLastBatch = Date.now() - lastBatchTime;

                if (isMassInvalidation && timeSinceLastBatch < 2000) {
                    // Frequent mass invalidations - suggest rebuilding entire cache
                    this._log(
                        `Frequent mass invalidation: ${actualInvalidations} files (may trigger cache rebuild next time)`
                    );
                } else if (this._options.verbose) {
                    // Normal batch invalidation
                    this._debugLog(
                        `Batch invalidation: ${actualInvalidations} files updated${
                            skippedFiles > 0 ? ` (${skippedFiles} already removed)` : ''
                        }`
                    );
                } else {
                    // Debug mode - show individual files only in debug
                    this._debugLog(
                        `Batch invalidation: ${actualInvalidations} files updated${
                            skippedFiles > 0 ? ` (${skippedFiles} already removed)` : ''
                        }`
                    );
                }

                this._lastInvalidationBatch.set(workspaceKey, Date.now());
            } else if (skippedFiles > 0) {
                this._debugLog(`Batch invalidation: ${skippedFiles} files already removed from cache`);
            }
        }

        // Clear all pending invalidations
        this._pendingInvalidations.clear();
        this._invalidationTimer = null;
    }

    /**
     * Check if invalidations suggest a workspace-wide change (git operations, build processes, etc.)
     */
    private _isWorkspaceWideChange(pendingFiles: Set<string>): boolean {
        if (pendingFiles.size < 10) return false;

        // Check for patterns that suggest workspace-wide changes
        const files = Array.from(pendingFiles);

        // Look for git-related changes (multiple files changing simultaneously)
        const gitRelatedPatterns = ['.git/', '__pycache__/', '.pyc', 'node_modules/'];
        const gitRelatedCount = files.filter((file) =>
            gitRelatedPatterns.some((pattern) => file.includes(pattern))
        ).length;

        // If more than 30% of files are git/build related, likely a workspace change
        if (gitRelatedCount > pendingFiles.size * 0.3) {
            return true;
        }

        // Check for generated file patterns
        const generatedPatterns = ['_pb2.py', '_pb2_grpc.py', '.generated.py', 'build/', 'dist/'];
        const generatedCount = files.filter((file) =>
            generatedPatterns.some((pattern) => file.includes(pattern))
        ).length;

        // If more than 50% are generated files, likely a build process
        if (generatedCount > pendingFiles.size * 0.5) {
            return true;
        }

        // Check for similar timestamps (files changed within 1 second of each other)
        // This suggests a batch operation like git checkout
        if (pendingFiles.size > 20) {
            return true; // Large batch is likely workspace-wide
        }

        return false;
    }

    /**
     * Batch invalidate files to reduce noise and improve performance.
     */
    private _batchInvalidateFile(workspaceRoot: Uri, fileUri: Uri): void {
        const key = workspaceRoot.key;
        const fileUriStr = fileUri.toString();

        // Add to pending invalidations
        if (!this._pendingInvalidations.has(key)) {
            this._pendingInvalidations.set(key, new Set<string>());
        }
        this._pendingInvalidations.get(key)!.add(fileUriStr);

        // Clear existing timer and set new one
        if (this._invalidationTimer) {
            clearTimeout(this._invalidationTimer);
        }

        this._invalidationTimer = setTimeout(() => {
            this._processBatchInvalidations();
        }, this._options.debounceMs || 50); // Configurable debounce time
    }
}
