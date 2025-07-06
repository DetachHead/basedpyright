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
 *   "basedpyright.analysis.workspaceSymbolsDebug": false  // Set to true for detailed invalidation logging
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
}

/** Cache statistics for monitoring and debugging. */
export interface CacheStats {
    workspaceCount: number;
    totalFileCount: number;
    totalSymbolCount: number;
    averageSymbolsPerFile: number;
    cacheHitRate: number;
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

    private _options: Required<Omit<WorkspaceSymbolCacheOptions, 'console' | 'debug'>> &
        Pick<WorkspaceSymbolCacheOptions, 'console' | 'debug'>;
    private _console?: ConsoleInterface;

    constructor(options?: WorkspaceSymbolCacheOptions) {
        this._options = {
            extensions: options?.extensions ?? ['.py', '.pyi'],
            maxResults: options?.maxResults ?? 500,
            maxFiles: options?.maxFiles ?? 3000,
            verbose: options?.verbose ?? false,
            debug: options?.debug ?? false,
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

            // Get all source files and sort by modification time (most recent first)
            const allFiles = program
                .getSourceFileInfoList()
                .filter((fileInfo) => {
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
                    if (this._options.verbose) {
                        this._log(`Error indexing file ${fileInfo.uri.toUserVisibleString()}: ${error}`);
                    }
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
                this._log(`Error during cache building for ${workspaceRoot.toUserVisibleString()}: ${error}`);
            }
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
        // If caching is disabled, return empty results to fall back to traditional search
        if (!this._enabled) {
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
        };
    }

    /**
     * Clear all caches (useful for testing or memory management).
     */
    clearAllCaches(): void {
        this._cache.clear();
        this._cacheMetadata.clear();
        this._buildingCaches.clear();
        this._cacheQueries = 0;
        this._cacheHits = 0;
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
            } else {
                this._debugLog(
                    `Skipping invalidation for workspace ${workspaceRoot.toUserVisibleString()} - no cache exists`
                );
            }
        } else {
            // Invalidate specific file
            const cached = this._cache.get(key);
            if (cached && cached.files[fileUri.toString()]) {
                if (this._options.verbose) {
                    this._log(`Invalidating file: ${fileUri.toUserVisibleString()}`);
                }
                delete cached.files[fileUri.toString()];
                // Mark metadata as stale by removing it
                this._cacheMetadata.delete(key);
            } else {
                this._debugLog(`Skipping invalidation for file ${fileUri.toUserVisibleString()} - not in cache`);
            }
        }
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
                return obj as CachedWorkspaceSymbols;
            }
        } catch (error) {
            if (this._options.verbose) {
                this._log(`Error reading cache file ${fileUri.toUserVisibleString()}: ${error}`);
            }
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
}
