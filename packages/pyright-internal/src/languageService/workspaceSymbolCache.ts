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

import { CancellationToken } from 'vscode-languageserver';
import { SymbolInformation } from 'vscode-languageserver-protocol';

import { ProgramView } from '../common/extensibility';
import { Uri } from '../common/uri/uri';
import { SymbolIndexer } from './symbolIndexer';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { getFileInfo } from '../analyzer/analyzerNodeInfo';

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
    }

    /**
     * Return matching symbols. Falls back to building the cache on demand if
     * none exists.
     */
    search(
        workspaceRoot: Uri,
        program: ProgramView,
        query: string,
        token?: CancellationToken
    ): SymbolInformation[] {
        const cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            // Synchronous rebuild is expensive; in real impl we'd schedule async
            // and block for now. For skeleton we run synchronously.
            this.cacheWorkspaceSymbols(workspaceRoot, program, /* force */ true, CancellationToken.None);
        }

        const result: SymbolInformation[] = [];
        const cacheToUse = this._cache.get(workspaceRoot.key);
        if (!cacheToUse) {
            return result;
        }

        for (const fileSymbols of Object.values(cacheToUse.files)) {
            for (const sym of fileSymbols) {
                if (sym.name.includes(query)) {
                    // TODO: Convert back to full SymbolInformation with proper URI.
                    // Placeholder conversion:
                    result.push({
                        name: sym.name,
                        kind: sym.kind as any,
                        location: {
                            uri: '',
                            range: sym.range,
                        },
                        containerName: sym.container,
                    });

                    if (result.length >= this._options.maxResults) {
                        return result;
                    }
                }
            }
        }

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
} 