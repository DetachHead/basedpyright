/*
 * workspaceSymbolsCommand.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Implements command for workspace symbols functionality in CLI.
 */

import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { WorkspaceSymbolProvider } from '../languageService/workspaceSymbolProvider';
import { WorkspaceSymbolCache } from '../languageService/workspaceSymbolCache';
import { ServerCommand } from './commandController';

export class WorkspaceSymbolsCommand implements ServerCommand {
    private _symbolCache: WorkspaceSymbolCache;

    constructor(private _ls: LanguageServerInterface) {
        // Initialize workspace symbol cache with disk persistence enabled
        this._symbolCache = new WorkspaceSymbolCache(
            this._ls.console,
            this._ls.serviceProvider.fs(),
            this._ls.serviceProvider,
            true, // Enable disk persistence
            undefined // Use default cache directory
        );
    }

    get command(): string {
        return 'basedpyright.workspaceSymbols';
    }

    async execute(params: ExecuteCommandParams, token: CancellationToken): Promise<any> {
        const args = params.arguments || [];
        const subCommand = args[0] as string;

        switch (subCommand) {
            case 'search':
                return this._searchSymbols(args[1] as string, token);
            
            case 'cache':
                return this._manageCache(args[1] as string, args[2], token);
            
            case 'stats':
                return this._getCacheStats();
            
            default:
                return {
                    error: `Unknown workspace symbols command: ${subCommand}`,
                    usage: 'Available commands: search <query>, cache <build|clear|stats>, stats'
                };
        }
    }

    private async _searchSymbols(query: string, token: CancellationToken): Promise<any> {
        if (!query || query.trim().length === 0) {
            return { error: 'Query cannot be empty' };
        }

        try {
            const workspaces = await this._ls.getWorkspaces();
            if (workspaces.length === 0) {
                return { error: 'No workspaces available' };
            }

            const provider = new WorkspaceSymbolProvider(
                workspaces,
                undefined, // No progress reporter for CLI
                query.trim(),
                token,
                this._ls,
                this._symbolCache
            );

            const symbols = provider.reportSymbols();
            
            return {
                query,
                symbolCount: symbols.length,
                symbols: symbols.slice(0, 50), // Limit results for CLI display
                truncated: symbols.length > 50
            };

        } catch (error) {
            return { error: `Search failed: ${error}` };
        }
    }

    private async _manageCache(action: string, workspaceUri?: string, token?: CancellationToken): Promise<any> {
        try {
            switch (action) {
                case 'build':
                    return this._buildCache(workspaceUri, token);
                
                case 'clear':
                    return this._clearCache(workspaceUri);
                
                case 'stats':
                    return this._getCacheStats();
                
                default:
                    return { 
                        error: `Unknown cache action: ${action}`,
                        usage: 'Available actions: build [workspace], clear [workspace], stats'
                    };
            }
        } catch (error) {
            return { error: `Cache operation failed: ${error}` };
        }
    }

    private async _buildCache(workspaceUri?: string, token?: CancellationToken): Promise<any> {
        const workspaces = await this._ls.getWorkspaces();
        if (workspaces.length === 0) {
            return { error: 'No workspaces available' };
        }

        const results: any[] = [];
        
        for (const workspace of workspaces) {
            if (workspaceUri && workspace.rootUri?.toString() !== workspaceUri) {
                continue; // Skip if specific workspace requested and this isn't it
            }

            if (!workspace.rootUri) {
                continue;
            }

            try {
                const startTime = Date.now();
                let symbolCount = 0;

                await new Promise<void>((resolve, reject) => {
                    workspace.service.run((program: any) => {
                        try {
                            this._symbolCache.cacheWorkspaceSymbols(
                                workspace.rootUri!,
                                program,
                                true // Force refresh
                            );
                            
                            const stats = this._symbolCache.getCacheStats();
                            symbolCount = stats.totalSymbolCount;
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    }, token || CancellationToken.None);
                });

                const elapsedTime = Date.now() - startTime;
                results.push({
                    workspace: workspace.rootUri.toUserVisibleString(),
                    symbolCount,
                    elapsedTime: `${elapsedTime}ms`,
                    status: 'success'
                });

            } catch (error) {
                results.push({
                    workspace: workspace.rootUri.toUserVisibleString(),
                    error: String(error),
                    status: 'failed'
                });
            }
        }

        return {
            action: 'build',
            results,
            totalWorkspaces: results.length
        };
    }

    private async _clearCache(workspaceUri?: string): Promise<any> {
        try {
            if (workspaceUri) {
                // For specific workspace, just clear the cache
                this._symbolCache.emptyCache();
                return {
                    action: 'clear',
                    workspace: workspaceUri,
                    status: 'success'
                };
            } else {
                // Clear all caches
                this._symbolCache.emptyCache();
                return {
                    action: 'clear',
                    scope: 'all',
                    status: 'success'
                };
            }
        } catch (error) {
            return {
                action: 'clear',
                error: String(error),
                status: 'failed'
            };
        }
    }

    private _getCacheStats(): any {
        const stats = this._symbolCache.getCacheStats();
        return {
            ...stats,
            cacheSize: `${stats.totalSymbolCount} symbols in ${stats.totalFileCount} files across ${stats.workspaceCount} workspaces`,
            averageSymbolsPerFile: stats.averageSymbolsPerFile
        };
    }
}
