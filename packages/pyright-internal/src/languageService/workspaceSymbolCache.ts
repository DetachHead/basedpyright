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
    /** Map keyed by file URI (string) containing the flattened symbol list. */
    files: Record<string, IndexedSymbol[]>;
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

/**
 * In-memory & on-disk cache for Workspace Symbol search.
 *
 * NOTE: Only the public API surface is complete for now; implementation will
 * follow incrementally in subsequent commits.
 */
export class WorkspaceSymbolCache {
    private _cache = new Map<string /* workspaceRoot.key */, CachedWorkspaceSymbols>();
    private _saveTimers = new Map<string, any>();

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
        console.log('cacheWorkspaceSymbols@@@', workspaceRoot, program, forceRefresh, token);
        // TODO: incremental build respecting mtime/hash.
        // For the initial skeleton we eagerly rebuild everything so downstream
        // callers can experiment.
        const symbolMap: Record<string, IndexedSymbol[]> = {};

        for (const fileInfo of program.getSourceFileInfoList()) {
            throwIfCancellationRequested(token);

            // Skip non-user code for now.
            // TODO: respect isUserCode helper once imported.
            const parseResults = program.getParseResults(fileInfo.uri);
            if (!parseResults) {
                continue;
            }
            const analyzerFileInfo = getFileInfo(parseResults.parserOutput.parseTree);
            if (!analyzerFileInfo) {
                continue;
            }

            const symbols = SymbolIndexer.indexSymbols(
                analyzerFileInfo,
                parseResults,
                { includeAliases: false },
                token ?? CancellationToken.None
            );

            // Flatten & convert to serialisable form.
            const flat: IndexedSymbol[] = this._flattenIndexedSymbols(symbols, '');
            symbolMap[fileInfo.uri.toString()] = flat;
        }

        const cached: CachedWorkspaceSymbols = {
            version: 1,
            checksum: 'TEMP', // TODO: compute checksum
            files: symbolMap,
        };
        this._cache.set(workspaceRoot.key, cached);
        this._scheduleSaveToDisk(workspaceRoot, cached, program.fileSystem);
        console.log('cached LOL', cached);
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
        let cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            // Try to load from disk first.
            cached = this._loadFromDisk(workspaceRoot, program.fileSystem);
            if (cached) {
                this._cache.set(workspaceRoot.key, cached);
            }
        }
        if (!cached) {
            // Synchronous rebuild is expensive; in real impl we'd schedule async
            // and block for now. For skeleton we run synchronously.
            this.cacheWorkspaceSymbols(workspaceRoot, program, /* force */ true, token);
        }

        const result: SymbolInformation[] = [];
        const cacheToUse = this._cache.get(workspaceRoot.key);
        if (!cacheToUse) {
            return result;
        }

        for (const [fileUriStr, fileSymbols] of Object.entries(cacheToUse.files)) {
            for (const sym of fileSymbols) {
                if (!sym.name.includes(query)) {
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

        // TODO finish
        return result;
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
            // Defer checksum recompute until next build.
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
}
