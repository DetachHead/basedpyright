/*
 * typeCacheExtractor.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: BasedPyright Contributors
 *
 * Utility to extract cache data from analysis results.
 */

import { hashString } from '../common/stringUtils';
import { FileSystem } from '../common/fileSystem';
import { Declaration, DeclarationType } from './declaration';
import { SourceFileInfo } from './sourceFileInfo';
import { Symbol, SymbolTable } from './symbol';
import { TypeEvaluator } from './typeEvaluatorTypes';
import {
    TypeCacheEntry,
    CacheDependency,
    CachedSymbol,
    CachedType,
    CachedLocation,
    CachedDeclaration,
} from './typeCacheManager';
import {
    Type,
    TypeCategory,
    isClass,
    isFunction,
    isModule,
    isUnknown,
    isAny,
    isNever,
    ClassType,
    FunctionType,
} from './types';
import { ParseFileResults } from '../parser/parser';

export class TypeCacheExtractor {
    private readonly _fileSystem: FileSystem;
    private readonly _evaluator: TypeEvaluator;

    constructor(fileSystem: FileSystem, evaluator: TypeEvaluator) {
        this._fileSystem = fileSystem;
        this._evaluator = evaluator;
    }

    extractCacheEntry(sourceFileInfo: SourceFileInfo, analysisTime: number): TypeCacheEntry | undefined {
        const parseResults = sourceFileInfo.sourceFile.getParseResults();
        if (!parseResults) {
            return undefined;
        }

        const symbolTable = sourceFileInfo.sourceFile.getModuleSymbolTable();
        if (!symbolTable) {
            return undefined;
        }

        const filePath = sourceFileInfo.uri.getFilePath();
        const fileContent = this._fileSystem.readFileSync(sourceFileInfo.uri, 'utf8');
        const fileHash = hashString(fileContent).toString();

        const dependencies = this._extractDependencies(sourceFileInfo);
        const symbols = this._extractSymbols(symbolTable, parseResults);
        const types = this._extractTypes(symbols, symbolTable);
        const exports = this._extractExports(symbolTable);

        return {
            version: '', // Will be set by TypeCacheManager
            configHash: '', // Will be set by TypeCacheManager
            filePath,
            fileHash,
            lastModified: Date.now(),
            analysisTime,
            dependencies,
            symbols,
            types,
            exports,
            diagnosticCount: 0, // Will be computed separately
        };
    }

    private _extractDependencies(sourceFileInfo: SourceFileInfo): CacheDependency[] {
        const dependencies: CacheDependency[] = [];
        const imports = sourceFileInfo.imports;

        for (const importFileInfo of imports) {
            if (this._fileSystem.existsSync(importFileInfo.uri)) {
                try {
                    const importContent = this._fileSystem.readFileSync(importFileInfo.uri, 'utf8');
                    const importHash = hashString(importContent).toString();

                    dependencies.push({
                        module: importFileInfo.sourceFile.getModuleName(),
                        filePath: importFileInfo.uri.getFilePath(),
                        hash: importHash,
                    });
                } catch {
                    // Skip if we can't read the import
                }
            }
        }

        return dependencies;
    }

    private _extractSymbols(symbolTable: SymbolTable, parseResults: ParseFileResults): CachedSymbol[] {
        const symbols: CachedSymbol[] = [];

        symbolTable.forEach((symbol, name) => {
            const declarations = symbol.getDeclarations();
            if (declarations.length === 0) {
                return;
            }

            const firstDecl = declarations[0];
            const location = this._getLocationFromDeclaration(firstDecl);

            const cachedSymbol: CachedSymbol = {
                name,
                kind: this._getSymbolKind(symbol, firstDecl),
                location,
                isExported: !symbol.isExternallyHidden(),
                isPrivate: symbol.isPrivateMember(),
                declarations: declarations.map((decl) => this._convertDeclaration(decl)),
            };

            symbols.push(cachedSymbol);
        });

        return symbols;
    }

    private _extractTypes(symbols: CachedSymbol[], symbolTable: SymbolTable): CachedType[] {
        const types: CachedType[] = [];

        for (const cachedSymbol of symbols) {
            const symbol = symbolTable.get(cachedSymbol.name);
            if (!symbol) continue;

            try {
                const symbolType = this._evaluator.getEffectiveTypeOfSymbol(symbol);
                const typeString = this._evaluator.printType(symbolType);
                const complexity = this._calculateTypeComplexity(symbolType);

                types.push({
                    name: cachedSymbol.name,
                    inferredType: typeString,
                    kind: this._getTypeKind(symbolType),
                    complexity,
                });
            } catch {
                // Skip if we can't get the type
            }
        }

        return types;
    }

    private _extractExports(symbolTable: SymbolTable): string[] {
        const exports: string[] = [];

        symbolTable.forEach((symbol, name) => {
            if (!symbol.isExternallyHidden() && !name.startsWith('_')) {
                exports.push(name);
            }
        });

        return exports;
    }

    private _getLocationFromDeclaration(declaration: Declaration): CachedLocation {
        if (declaration.range) {
            return {
                line: declaration.range.start.line,
                column: declaration.range.start.character,
            };
        }

        return { line: 0, column: 0 };
    }

    private _getSymbolKind(symbol: Symbol, declaration: Declaration): string {
        switch (declaration.type) {
            case DeclarationType.Class:
                return 'class';
            case DeclarationType.Function:
                return 'function';
            case DeclarationType.Variable:
                return 'variable';
            case DeclarationType.Param:
                return 'parameter';
            case DeclarationType.TypeParam:
                return 'typeParameter';
            case DeclarationType.Alias:
                return 'alias';
            case DeclarationType.TypeAlias:
                return 'typeAlias';
            default:
                return 'unknown';
        }
    }

    private _getTypeKind(type: Type): string {
        if (isClass(type)) {
            return 'class';
        } else if (isFunction(type)) {
            return 'function';
        } else if (isModule(type)) {
            return 'module';
        } else if (isUnknown(type)) {
            return 'unknown';
        } else if (isAny(type)) {
            return 'any';
        } else if (isNever(type)) {
            return 'never';
        }

        return 'other';
    }

    private _calculateTypeComplexity(type: Type): number {
        // Simple complexity metric based on type category and nesting
        let complexity = 1;

        if (type.category === TypeCategory.Class) {
            const classType = type as ClassType;
            // Add complexity for generic arguments
            if (classType.priv.typeArgs) {
                complexity += classType.priv.typeArgs.length * 2;
            }

            // Add complexity for inheritance
            if (classType.shared.baseClasses) {
                complexity += classType.shared.baseClasses.length;
            }
        } else if (type.category === TypeCategory.Function) {
            const functionType = type as FunctionType;
            // Add complexity for parameter count
            if (functionType.shared.parameters) {
                complexity += functionType.shared.parameters.length;
            }
        }

        return complexity;
    }

    private _convertDeclaration(declaration: Declaration): CachedDeclaration {
        return {
            type: this._getDeclarationTypeName(declaration.type),
            path: declaration.uri?.getFilePath() || '',
            range: {
                start: {
                    line: declaration.range?.start.line || 0,
                    column: declaration.range?.start.character || 0,
                },
                end: {
                    line: declaration.range?.end.line || 0,
                    column: declaration.range?.end.character || 0,
                },
            },
        };
    }

    private _getDeclarationTypeName(type: DeclarationType): string {
        switch (type) {
            case DeclarationType.Class:
                return 'Class';
            case DeclarationType.Function:
                return 'Function';
            case DeclarationType.Variable:
                return 'Variable';
            case DeclarationType.Param:
                return 'Param';
            case DeclarationType.TypeParam:
                return 'TypeParam';
            case DeclarationType.Alias:
                return 'Alias';
            case DeclarationType.TypeAlias:
                return 'TypeAlias';
            case DeclarationType.Intrinsic:
                return 'Intrinsic';
            case DeclarationType.SpecialBuiltInClass:
                return 'SpecialBuiltInClass';
            default:
                return 'Unknown';
        }
    }
}
