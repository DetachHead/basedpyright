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
    private _cache = new Map<string /* workspaceRoot.key */, CachedWorkspaceSymbols>();
    private _saveTimers = new Map<string, any>();
    private _buildingCaches = new Set<string>(); // Track which workspaces are currently building
    private _cacheQueries = 0; // Track total queries for hit rate calculation
    private _cacheHits = 0; // Track cache hits for hit rate calculation

    private _options: Required<WorkspaceSymbolCacheOptions>;

    constructor(options?: WorkspaceSymbolCacheOptions) {
        this._options = {
            extensions: options?.extensions ?? ['.py', '.pyi'],
            maxResults: options?.maxResults ?? 500,
        };
    }

    /**
     * Build (or refresh) the cache for a workspace.
     * @param forceRefresh When true, rebuilds all files regardless of timestamps.
     */
    async cacheWorkspaceSymbols(
        workspaceRoot: Uri,
        program: ProgramView,
        forceRefresh = false,
        token: CancellationToken = CancellationToken.None
    ): Promise<void> {
        const existingCache = this._cache.get(workspaceRoot.key) || this._loadFromDisk(workspaceRoot, program.fileSystem);
        const newFiles: Record<string, FileIndex> = {};
        
        for (const fileInfo of program.getSourceFileInfoList()) {
            throwIfCancellationRequested(token);

            // Skip non-user code for now.
            const parseResults = program.getParseResults(fileInfo.uri);
            if (!parseResults) {
                continue;
            }
            const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
            if (!analyzerFileInfo) {
                continue;
            }

            const fileUriStr = fileInfo.uri.toString();
            const stat = program.fileSystem.statSync(fileInfo.uri);
            const mtime = stat?.mtimeMs || 0;
            
            // Check if we can reuse existing cache entry
            const existingFile = existingCache?.files[fileUriStr];
            if (!forceRefresh && existingFile && existingFile.mtime === mtime) {
                // File hasn't changed, reuse cached symbols
                newFiles[fileUriStr] = existingFile;
                continue;
            }
            
            // File changed or doesn't exist in cache, need to recompute
            const bytes = program.fileSystem.readFileSync(fileInfo.uri, null).subarray(0, 8192);
            const hash = fnv1a(bytes);
            
            // Double-check with content hash if mtime changed but content might be same
            if (!forceRefresh && existingFile && existingFile.hash === hash) {
                // Content unchanged, just update mtime and reuse symbols
                newFiles[fileUriStr] = {
                    ...existingFile,
                    mtime
                };
                continue;
            }

            // Need to rebuild symbols for this file
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
                hash,
                symbols: flat
            };
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
        
        this._cache.set(workspaceRoot.key, cached);
        this._scheduleSaveToDisk(workspaceRoot, cached, program.fileSystem);
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

        let cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            // Try to load from disk first.
            cached = this._loadFromDisk(workspaceRoot, program.fileSystem);
            if (cached) {
                this._cache.set(workspaceRoot.key, cached);
            }
        }
        
        // If we have a cache, search it
        if (cached) {
            this._cacheHits++;
            return this._searchCache(cached, query);
        }
        
        // No cache available - trigger async cache build and return empty for now
        // The next search will have the cache ready
        this._triggerAsyncCacheBuild(workspaceRoot, program, token);
        return [];
    }

    /**
     * Warm up the cache for a workspace in the background.
     * This should be called when a workspace is first opened.
     */
    warmupCache(workspaceRoot: Uri, program: ProgramView): void {
        // Check if cache already exists
        if (this._cache.has(workspaceRoot.key)) {
            return;
        }

        // Try loading from disk first
        const cached = this._loadFromDisk(workspaceRoot, program.fileSystem);
        if (cached) {
            this._cache.set(workspaceRoot.key, cached);
            return;
        }

        // Trigger async cache build in background
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
        if (!this._cache.has(workspaceRoot.key)) {
            return;
        }
        if (!fileUri) {
            this._cache.delete(workspaceRoot.key);
        } else {
            const cached = this._cache.get(workspaceRoot.key)!;
            delete cached.files[fileUri.toString()];
            // Recompute checksum on next build
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
            return;
        }

        this._buildingCaches.add(key);
        
        // Build cache asynchronously
        setTimeout(async () => {
            try {
                await this.cacheWorkspaceSymbols(workspaceRoot, program, false, token);
            } catch (error) {
                // Log error but don't throw - this is background work
                console.error('Background cache build failed:', error);
            } finally {
                this._buildingCaches.delete(key);
            }
        }, 0);
    }
}
