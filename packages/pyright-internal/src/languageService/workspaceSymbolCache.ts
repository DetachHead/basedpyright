/*
 * workspaceSymbolCache.ts
 * Preliminary skeleton for workspace-wide symbols caching.
 *
 * This cache is **not yet wired** into the LSP pipeline; subsequent commits will
 * integrate it with WorkspaceSymbolProvider and invalidation hooks.
 *
 * The initial goal is to provide the public surface so that other files can
 * begin to depend on it without TypeScript compile errors.
 */

import { CancellationToken, SymbolInformation } from 'vscode-languageserver';

import { ProgramView } from '../common/extensibility';
import { Uri } from '../common/uri/uri';
import { SymbolIndexer } from './symbolIndexer';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { getFileInfo } from '../analyzer/analyzerNodeInfo';
import { FileSystem } from '../common/fileSystem';
import { ReadOnlyFileSystem } from '../common/fileSystem';
import { fnv1a } from '../common/fnv1a';

/**
 * Persisted representation of a workspace-wide symbol cache.
 * This will eventually be serialized to JSON on disk under
 *   <workspace>/.pyright/workspaceSymbolsCache_v1.json
 */
export interface CachedWorkspaceSymbols {
    /** Increment when the on-disk schema changes. */
    version: number;
    /** Aggregated checksum (mtime/hash) so we can detect global invalidation. */
    checksum: string;
    /** Map keyed by file URI (string) containing the file metadata and symbols. */
    files: Record<string, FileIndex>;
}

/** File metadata and symbols for incremental caching. */
export interface FileIndex {
    /** File modification time (milliseconds since epoch). */
    mtime: number;
    /** Content hash (FNV-1a) of first 8KB for change detection. */
    hash: string;
    /** Flattened symbol list for this file. */
    symbols: IndexedSymbol[];
}

/** Subset of SymbolInformation that is serializable without circular refs. */
export interface IndexedSymbol {
    name: string;
    container?: string;
    kind: number; // SymbolKind enum value – store as number for compactness.
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
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
 * In-memory & on-disk cache for Workspace Symbol search.
 *
 * NOTE: Only the public API surface is complete for now; implementation will
 * follow incrementally in subsequent commits.
 */
export class WorkspaceSymbolCache {
    [x: string]: any;
    private _cache = new Map<string /* workspaceRoot.key */, CachedWorkspaceSymbols>();
    private _cacheMetadata = new Map<string, { checksum: string; fileCount: number; lastModified: number }>();
    private _saveTimers = new Map<string, any>();
    private _buildingCaches = new Set<string>(); // Track which workspaces are currently building
    private _cacheQueries = 0; // Track total queries for hit rate calculation
    private _cacheHits = 0; // Track cache hits for hit rate calculation

    private _options: Required<WorkspaceSymbolCacheOptions>;

    constructor(options?: WorkspaceSymbolCacheOptions) {
        this._options = {
            extensions: options?.extensions ?? ['.py', '.pyi'],
            maxResults: options?.maxResults ?? 500,
            maxFiles: options?.maxFiles ?? 3000,
            verbose: options?.verbose ?? false,
        };
    }

    /**
     * Update cache options (useful for runtime configuration).
     */
    setOptions(options: Partial<WorkspaceSymbolCacheOptions>): void {
        this._options = {
            ...this._options,
            ...options,
        };
    }

    /**
     * Build (or refresh) the cache for a workspace.
     * @param forceRebuild When true, rebuilds all files. When false, only rebuilds files that have changed.
     */
    async cacheWorkspaceSymbols(
        workspaceRoot: Uri,
        program: ProgramView,
        forceRebuild = false,
        token: CancellationToken = CancellationToken.None
    ): Promise<void> {
        const existingCache = this._cache.get(workspaceRoot.key) || this._loadFromDisk(workspaceRoot, program.fileSystem);
        
        // If we have existing cache and not forcing rebuild, just reuse it entirely
        if (existingCache && !forceRebuild) {
            if (this._options.verbose) {
                const fileCount = Object.keys(existingCache.files).length;
                const symbolCount = Object.values(existingCache.files).reduce((sum, file) => sum + file.symbols.length, 0);
                console.log(`[CACHE] Reusing entire existing cache: ${fileCount} files, ${symbolCount} symbols (skipping file iteration)`);
            }
            
            // Store metadata for lazy loading
            const maxMtime = Math.max(...Object.values(existingCache.files).map(f => f.mtime));
            this._cacheMetadata.set(workspaceRoot.key, {
                checksum: existingCache.checksum,
                fileCount: Object.keys(existingCache.files).length,
                lastModified: maxMtime
            });
            
            this._cache.set(workspaceRoot.key, existingCache);
            return; // Exit early - no file iteration needed
        }

        const newFiles: Record<string, FileIndex> = {};
        
        // Get all source files and sort by modification time (most recent first)
        const allFiles = program.getSourceFileInfoList()
            .filter(fileInfo => {
                const parseResults = program.getParseResults(fileInfo.uri);
                if (!parseResults) return false;
                const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
                return !!analyzerFileInfo;
            })
            .map(fileInfo => ({
                fileInfo,
                stat: program.fileSystem.statSync(fileInfo.uri),
            }))
            .sort((a, b) => (b.stat?.mtimeMs || 0) - (a.stat?.mtimeMs || 0)) // Most recent first
            .slice(0, this._options.maxFiles); // Limit to maxFiles

        console.log(`Indexing ${allFiles.length} most recent files (limit: ${this._options.maxFiles})`);

        let processedCount = 0;
        let reusedCount = 0;
        let rebuiltCount = 0;

        for (const { fileInfo, stat } of allFiles) {
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
                if (existingFile.hash === currentHash || 
                    (existingFile.mtime === mtime && existingFile.hash)) {
                    
                    // File hasn't changed, reuse cached symbols
                    newFiles[fileUriStr] = {
                        ...existingFile,
                        mtime, // Update mtime to current value
                        hash: currentHash // Update hash to current value
                    };
                    reusedCount++;
                    if (this._options.verbose) {
                        const reason = existingFile.hash === currentHash ? "hash match" : "mtime match";
                        console.log(`[CACHE] Reused (${reason}): ${fileInfo.uri.toUserVisibleString()} (${existingFile.symbols.length} symbols)`);
                    }
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
                symbols: flat
            };
            
            rebuiltCount++;
            const reason = forceRebuild ? "force rebuild" : 
                          !existingFile ? "new file" : "file changed";
            if (this._options.verbose) {
                console.log(`[CACHE] Indexed (${reason}): ${fileInfo.uri.toUserVisibleString()} (${flat.length} symbols)`);
            }
            
            processedCount++;
        }

        if (this._options.verbose) {
            console.log(`[CACHE] Summary: ${processedCount} files processed, ${reusedCount} reused, ${rebuiltCount} rebuilt`);
        }

        // Compute overall checksum for the workspace
        const checksumData = Object.keys(newFiles).sort().map(uri => {
            const file = newFiles[uri];
            return `${uri}:${file.mtime}:${file.hash}`;
        }).join('|');
        const checksum = fnv1a(new TextEncoder().encode(checksumData));

        const cached: CachedWorkspaceSymbols = {
            version: 1,
            checksum,
            files: newFiles,
        };
        
        // Store metadata for lazy loading
        const maxMtime = Math.max(...Object.values(newFiles).map(f => f.mtime));
        this._cacheMetadata.set(workspaceRoot.key, {
            checksum,
            fileCount: Object.keys(newFiles).length,
            lastModified: maxMtime
        });
        
        this._cache.set(workspaceRoot.key, cached);
        this._scheduleSaveToDisk(workspaceRoot, cached, program.fileSystem);
    }

    /**
     * Update the cache incrementally - check files for changes and only rebuild changed ones.
     */
    async updateWorkspaceSymbols(
        workspaceRoot: Uri,
        program: ProgramView,
        token: CancellationToken = CancellationToken.None
    ): Promise<void> {
        const existingCache = this._cache.get(workspaceRoot.key) || this._loadFromDisk(workspaceRoot, program.fileSystem);
        
        // If no existing cache, fall back to full rebuild
        if (!existingCache) {
            console.log('No existing cache found, performing full rebuild...');
            await this.cacheWorkspaceSymbols(workspaceRoot, program, true, token);
            return;
        }

        console.log(`Incrementally updating existing cache with ${Object.keys(existingCache.files).length} files...`);
        
        const newFiles: Record<string, FileIndex> = {};
        let reusedCount = 0;
        let rebuiltCount = 0;
        let checkedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        const totalFiles = Object.keys(existingCache.files).length;
        const startTime = Date.now();

        // Start with existing cache files
        for (const [fileUriStr, existingFile] of Object.entries(existingCache.files)) {
            throwIfCancellationRequested(token);
            
            // Progress logging every 100 files
            if (checkedCount % 100 === 0 && checkedCount > 0) {
                const progress = Math.round((checkedCount / totalFiles) * 100);
                console.log(`[CACHE] Progress: ${checkedCount}/${totalFiles} files (${progress}%), ${reusedCount} reused, ${rebuiltCount} rebuilt`);
            }
            
            try {
                const fileUri = Uri.parse(fileUriStr, program.serviceProvider);
                
                // Quick stat check - if file doesn't exist anymore, skip it
                const stat = program.fileSystem.statSync(fileUri);
                if (!stat) {
                    skippedCount++;
                    if (this._options.verbose) {
                        console.log(`[CACHE] Skipped (file deleted): ${fileUri.toUserVisibleString()}`);
                    }
                    continue;
                }
                
                checkedCount++;
                const mtime = stat.mtimeMs || 0;
                
                // Fast path: if mtime hasn't changed, reuse immediately
                if (existingFile.mtime === mtime) {
                    newFiles[fileUriStr] = existingFile;
                    reusedCount++;
                    if (this._options.verbose) {
                        console.log(`[CACHE] Reused (mtime unchanged): ${fileUri.toUserVisibleString()} (${existingFile.symbols.length} symbols)`);
                    }
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
                    if (this._options.verbose) {
                        console.log(`[CACHE] Reused (content unchanged): ${fileUri.toUserVisibleString()} (${existingFile.symbols.length} symbols)`);
                    }
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
                    symbols: flat
                };
                
                rebuiltCount++;
                if (this._options.verbose) {
                    console.log(`[CACHE] Rebuilt (content changed): ${fileUri.toUserVisibleString()} (${flat.length} symbols)`);
                }
                
            } catch (error) {
                // File might have been deleted or become inaccessible
                errorCount++;
                if (this._options.verbose) {
                    console.log(`[CACHE] Skipped (error): ${fileUriStr} - ${error}`);
                }
                continue;
            }
        }

        // TODO: Add new files that weren't in the cache (optional, could be a separate mode)
        // For now, we only update existing files for maximum speed

        const elapsedTime = Date.now() - startTime;
        console.log(`[CACHE] Incremental update completed: ${checkedCount}/${totalFiles} files checked, ${reusedCount} reused, ${rebuiltCount} rebuilt, ${skippedCount} skipped, ${errorCount} errors (${elapsedTime}ms)`);

        // Handle case where no files remain (all deleted or skipped)
        if (Object.keys(newFiles).length === 0) {
            console.log(`[CACHE] No files remain in cache after update - clearing cache`);
            this._cache.delete(workspaceRoot.key);
            this._cacheMetadata.delete(workspaceRoot.key);
            return;
        }

        // Compute overall checksum for the workspace
        const checksumData = Object.keys(newFiles).sort().map(uri => {
            const file = newFiles[uri];
            return `${uri}:${file.mtime}:${file.hash}`;
        }).join('|');
        const checksum = fnv1a(new TextEncoder().encode(checksumData));

        const cached: CachedWorkspaceSymbols = {
            version: 1,
            checksum,
            files: newFiles,
        };
        
        // Store metadata for lazy loading
        const maxMtime = Math.max(...Object.values(newFiles).map(f => f.mtime));
        this._cacheMetadata.set(workspaceRoot.key, {
            checksum,
            fileCount: Object.keys(newFiles).length,
            lastModified: maxMtime
        });
        
        this._cache.set(workspaceRoot.key, cached);
        this._scheduleSaveToDisk(workspaceRoot, cached, program.fileSystem);
    }

    /**
     * Build (or refresh) the cache for a workspace and save immediately.
     * This is useful for CLI scenarios where we want to ensure the cache is saved before exit.
     */
    async cacheWorkspaceSymbolsImmediate(
        workspaceRoot: Uri,
        program: ProgramView,
        forceRebuild = false,
        token: CancellationToken = CancellationToken.None
    ): Promise<void> {
        await this.cacheWorkspaceSymbols(workspaceRoot, program, forceRebuild, token);
        
        // Save immediately instead of scheduling
        const cached = this._cache.get(workspaceRoot.key);
        if (cached) {
            this._saveToDisk(workspaceRoot, cached, program.fileSystem);
        }
    }

    /**
     * Update cache incrementally and save immediately.
     */
    async updateWorkspaceSymbolsImmediate(
        workspaceRoot: Uri,
        program: ProgramView,
        token: CancellationToken = CancellationToken.None
    ): Promise<void> {
        await this.updateWorkspaceSymbols(workspaceRoot, program, token);
        
        // Save immediately instead of scheduling
        const cached = this._cache.get(workspaceRoot.key);
        if (cached) {
            this._saveToDisk(workspaceRoot, cached, program.fileSystem);
        }
    }

    /**
     * Return matching symbols. Falls back to building the cache on demand if
     * none exists.
     */
    search(
        workspaceRoot: Uri,
        program: ProgramView,
        query: string,
        token: CancellationToken = CancellationToken.None
    ): SymbolInformation[] {
        this._cacheQueries++;

        // Check if we have metadata first (lightweight check)
        let metadata = this._cacheMetadata.get(workspaceRoot.key);
        if (!metadata) {
            // Try to load metadata from disk
            metadata = this._loadCacheMetadata(workspaceRoot, program.fileSystem);
            if (metadata) {
                this._cacheMetadata.set(workspaceRoot.key, metadata);
            }
        }

        if (!metadata) {
            // No cache available - trigger async cache build and return empty for now
            this._triggerAsyncCacheBuild(workspaceRoot, program, token);
            return [];
        }

        // We have metadata, now lazy load the full cache only when needed
        let cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            // Load full cache from disk
            if (this._options.verbose) {
                console.log(`[CACHE] Loading full cache from disk for search query: "${query}"`);
            }
            cached = this._loadFromDisk(workspaceRoot, program.fileSystem);
            if (cached) {
                this._cache.set(workspaceRoot.key, cached);
                if (this._options.verbose) {
                    const totalSymbols = Object.values(cached.files).reduce((sum, file) => sum + file.symbols.length, 0);
                    console.log(`[CACHE] Full cache loaded: ${Object.keys(cached.files).length} files, ${totalSymbols} symbols`);
                }
            } else {
                // Cache file exists but couldn't load - trigger rebuild
                this._triggerAsyncCacheBuild(workspaceRoot, program, token);
                return [];
            }
        }
        
        // If we have a cache, search it
        this._cacheHits++;
        const results = this._searchCache(cached, query);
        if (this._options.verbose) {
            console.log(`[CACHE] Search results: ${results.length} symbols found for query "${query}"`);
        }
        return results;
    }

    /**
     * Warm up the cache for a workspace in the background.
     * This should be called when a workspace is first opened.
     */
    warmupCache(workspaceRoot: Uri, program: ProgramView): void {
        const key = workspaceRoot.key;
        
        // Check if cache already exists in memory
        if (this._cache.has(key)) {
            return;
        }

        // Check if we have metadata
        let metadata = this._cacheMetadata.get(key);
        if (!metadata) {
            // Try loading metadata from disk
            metadata = this._loadCacheMetadata(workspaceRoot, program.fileSystem);
            if (metadata) {
                this._cacheMetadata.set(key, metadata);
                if (this._options.verbose) {
                    console.log(`[CACHE] Metadata loaded: ${metadata.fileCount} files, checksum: ${metadata.checksum.substring(0, 8)}...`);
                }
                return; // Metadata loaded, full cache will be loaded on-demand
            }
        }

        // No metadata available - trigger async cache build in background
        this._triggerAsyncCacheBuild(workspaceRoot, program, CancellationToken.None);
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
        for (const timer of this._saveTimers.values()) {
            clearTimeout(timer);
        }
        this._saveTimers.clear();
        this._cacheQueries = 0;
        this._cacheHits = 0;
    }

    /** Mark a file or entire workspace as dirty. */
    invalidate(workspaceRoot: Uri, fileUri?: Uri) {
        const key = workspaceRoot.key;
        
        if (!fileUri) {
            // Invalidate entire workspace
            if (this._options.verbose) {
                console.log(`[CACHE] Invalidating entire workspace: ${workspaceRoot.toUserVisibleString()}`);
            }
            this._cache.delete(key);
            this._cacheMetadata.delete(key);
            
            // Cancel any pending save timers
            const timer = this._saveTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                this._saveTimers.delete(key);
            }
        } else {
            // Invalidate specific file
            if (this._options.verbose) {
                console.log(`[CACHE] Invalidating file: ${fileUri.toUserVisibleString()}`);
            }
            const cached = this._cache.get(key);
            if (cached) {
                delete cached.files[fileUri.toString()];
                // Mark metadata as stale by removing it
                this._cacheMetadata.delete(key);
            }
        }
    }

    // ————————————————————————————————————————————
    // Helpers
    // ————————————————————————————————————————————

    private _flattenIndexedSymbols(symbols: any[], container: string): IndexedSymbol[] {
        const out: IndexedSymbol[] = [];
        for (const s of symbols) {
            const fullContainer = container ? `${container}.${s.name}` : s.name;
            out.push({
                name: s.name,
                container: container || undefined,
                kind: s.kind,
                range: s.range ?? s.selectionRange,
                selectionRange: s.selectionRange ?? s.range,
            });
            if (s.children?.length) {
                out.push(...this._flattenIndexedSymbols(s.children, fullContainer));
            }
        }
        return out;
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
        } catch {
            /* ignore read errors */
        }
        return undefined;
    }

    private _loadCacheMetadata(workspaceRoot: Uri, fs: ReadOnlyFileSystem): { checksum: string; fileCount: number; lastModified: number } | undefined {
        const fileUri = this._getCacheFileUri(workspaceRoot);
        if (!fs.existsSync(fileUri)) return undefined;
        try {
            const text = fs.readFileSync(fileUri, 'utf8');
            const obj = JSON.parse(text);
            if (obj.version === 1 && obj.files && obj.checksum) {
                const files = obj.files;
                const fileCount = Object.keys(files).length;
                const lastModified = Math.max(...Object.values(files).map((f: any) => f.mtime || 0));
                return {
                    checksum: obj.checksum,
                    fileCount,
                    lastModified
                };
            }
        } catch {
            /* ignore read errors */
        }
        return undefined;
    }

    private _scheduleSaveToDisk(workspaceRoot: Uri, cached: CachedWorkspaceSymbols, fs: ReadOnlyFileSystem) {
        const key = workspaceRoot.key;
        if (this._saveTimers.has(key)) {
            clearTimeout(this._saveTimers.get(key));
        }
        const timer = setTimeout(() => {
            this._saveToDisk(workspaceRoot, cached, fs);
            this._saveTimers.delete(key);
        }, 1000);
        this._saveTimers.set(key, timer);
    }

    private _saveToDisk(workspaceRoot: Uri, cached: CachedWorkspaceSymbols, fs: ReadOnlyFileSystem) {
        const dirUri = workspaceRoot.combinePaths('.pyright');
        if (FileSystem.is(fs)) {
            if (!fs.existsSync(dirUri)) {
                try {
                    fs.mkdirSync(dirUri, { recursive: true });
                } catch {
                    // ignore write errors
                }
            }
            const fileUri = this._getCacheFileUri(workspaceRoot);
            try {
                fs.writeFileSync(fileUri, JSON.stringify(cached), null);
            } catch {
                // ignore write errors
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

    private _triggerAsyncCacheBuild(workspaceRoot: Uri, program: ProgramView, token: CancellationToken) {
        // Avoid multiple concurrent builds for the same workspace
        const key = workspaceRoot.key;
        if (this._buildingCaches.has(key)) {
            if (this._options.verbose) {
                console.log(`[CACHE] Build already in progress for: ${workspaceRoot.toUserVisibleString()}`);
            }
            return;
        }

        this._buildingCaches.add(key);
        
        if (this._options.verbose) {
            console.log(`[CACHE] Starting background cache build for: ${workspaceRoot.toUserVisibleString()}`);
        }
        
        // Build cache asynchronously
        setTimeout(async () => {
            try {
                await this.cacheWorkspaceSymbols(workspaceRoot, program, false, token);
                if (this._options.verbose) {
                    console.log(`[CACHE] Background cache build completed for: ${workspaceRoot.toUserVisibleString()}`);
                }
            } catch (error) {
                // Log error but don't throw - this is background work
                console.error('Background cache build failed:', error);
            } finally {
                this._buildingCaches.delete(key);
            }
        }, 0);
    }
}
