/*
 * fastSemanticTokensProvider.ts
 *
 * Provides basic semantic tokens from cached symbol information
 * before full type analysis is complete. This improves perceived
 * responsiveness during workspace initialization.
 */

import { CancellationToken, SemanticTokens, SemanticTokensBuilder } from 'vscode-languageserver';
import { Uri } from '../common/uri/uri';
import { IndexedSymbol, WorkspaceSymbolCache } from './workspaceSymbolCache';
import { tokenTypes, tokenModifiers } from './semanticTokensProvider';
import { ParseFileResults } from '../parser/parser';
import { throwIfCancellationRequested } from '../common/cancellationUtils';

/**
 * Provides basic semantic tokens from cached symbol information.
 * This gives immediate coloring feedback while full analysis runs in the background.
 */
export class FastSemanticTokensProvider {
    constructor(
        private _cache: WorkspaceSymbolCache,
        private _workspaceRoot: Uri,
        private _fileUri: Uri,
        private _parseResults: ParseFileResults,
        private _token: CancellationToken
    ) {}

    /**
     * Generate semantic tokens from cached symbol information.
     * Returns basic tokens based on symbol kinds without full type analysis.
     */
    getSemanticTokens(): SemanticTokens | undefined {
        throwIfCancellationRequested(this._token);

        const cached = this._cache.getCachedSymbols(this._workspaceRoot);
        if (!cached) {
            return undefined;
        }

        const fileUriStr = this._fileUri.toString();
        const fileIndex = cached.files[fileUriStr];
        if (!fileIndex) {
            return undefined;
        }

        const builder = new SemanticTokensBuilder();

        // Convert cached symbols to semantic tokens
        for (const symbol of fileIndex.symbols) {
            throwIfCancellationRequested(this._token);

            try {
                const tokenType = this._mapSymbolKindToTokenType(symbol.kind);
                const tokenModifiers = this._getTokenModifiers(symbol);

                if (tokenType && symbol.range) {
                    // Handle range format from cached symbols
                    const range = symbol.range;
                    if (range.start !== undefined && range.end !== undefined) {
                        const length = range.end.character - range.start.character;
                        if (length > 0) {
                            builder.push(
                                range.start.line,
                                range.start.character,
                                length,
                                this._encodeTokenType(tokenType),
                                this._encodeTokenModifiers(tokenModifiers)
                            );
                        }
                    }
                }
            } catch (error) {
                // Skip invalid symbols
                continue;
            }
        }

        return builder.build();
    }

    private _mapSymbolKindToTokenType(symbolKind: number): string | undefined {
        // Map LSP SymbolKind to semantic token types
        switch (symbolKind) {
            case 1: // File
                return undefined;
            case 2: // Module
                return 'namespace';
            case 3: // Namespace
                return 'namespace';
            case 4: // Package
                return 'namespace';
            case 5: // Class
                return 'class';
            case 6: // Method
                return 'method';
            case 7: // Property
                return 'property';
            case 8: // Field
                return 'property';
            case 9: // Constructor
                return 'method';
            case 10: // Enum
                return 'class';
            case 11: // Interface
                return 'class';
            case 12: // Function
                return 'function';
            case 13: // Variable
                return 'variable';
            case 14: // Constant
                return 'variable';
            case 15: // String
                return 'variable';
            case 16: // Number
                return 'variable';
            case 17: // Boolean
                return 'variable';
            case 18: // Array
                return 'variable';
            case 19: // Object
                return 'variable';
            case 20: // Key
                return 'variable';
            case 21: // Null
                return 'variable';
            case 22: // EnumMember
                return 'property';
            case 23: // Struct
                return 'class';
            case 24: // Event
                return 'property';
            case 25: // Operator
                return 'function';
            case 26: // TypeParameter
                return 'typeParameter';
            default:
                return 'variable';
        }
    }

    private _getTokenModifiers(symbol: IndexedSymbol): string[] {
        const modifiers: string[] = [];

        // Add basic modifiers based on symbol name patterns
        if (symbol.name.startsWith('_') && !symbol.name.startsWith('__')) {
            // Private member
            modifiers.push('readonly');
        } else if (symbol.name.startsWith('__') && symbol.name.endsWith('__')) {
            // Special method
            modifiers.push('defaultLibrary');
        } else if (symbol.name.toUpperCase() === symbol.name && symbol.name.length > 1) {
            // Constant
            modifiers.push('readonly');
        }

        return modifiers;
    }

    private _encodeTokenType(type: string): number {
        const idx = tokenTypes.indexOf(type);
        if (idx === -1) {
            throw new Error(`Unknown token type: ${type}`);
        }
        return idx;
    }

    private _encodeTokenModifiers(modifiers: string[]): number {
        let data = 0;
        for (const modifier of modifiers) {
            const idx = tokenModifiers.indexOf(modifier);
            if (idx !== -1) {
                data |= 1 << idx;
            }
        }
        return data;
    }
}
