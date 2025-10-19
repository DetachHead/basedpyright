/*
 * definitionProvider.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Logic that maps a position within a Python program file into
 * a "definition" of the item that is referred to at that position.
 * For example, if the location is within an import name, the
 * definition is the top of the resolved import file.
 */

import { CancellationToken } from 'vscode-languageserver';

import { getFileInfo } from '../analyzer/analyzerNodeInfo';
import { Declaration, DeclarationType, isUnresolvedAliasDeclaration } from '../analyzer/declaration';
import {
    getTypeOfAugmentedAssignment,
    getTypeOfBinaryOperation,
    getTypeOfIndex,
    getTypeOfUnaryOperation,
} from '../analyzer/operations';
import * as ParseTreeUtils from '../analyzer/parseTreeUtils';
import { SourceMapper, isStubFile } from '../analyzer/sourceMapper';
import { SynthesizedTypeInfo } from '../analyzer/symbol';
import { EvalFlags, TypeEvaluator, TypeResult } from '../analyzer/typeEvaluatorTypes';
import { doForEachSubtype } from '../analyzer/typeUtils';
import { TypeCategory } from '../analyzer/types';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { appendArray } from '../common/collectionUtils';
import { isDefined } from '../common/core';
import { DocumentRange } from '../common/docRange';
import { ProgramView } from '../common/extensibility';
import { convertOffsetsToRange, convertPositionToOffset } from '../common/positionUtils';
import { ServiceKeys } from '../common/serviceKeys';
import { ServiceProvider } from '../common/serviceProvider';
import { Position, rangesAreEqual } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { ParseNode, ParseNodeType } from '../parser/parseNodes';
import { getInfoNode, improveNodeByOffset } from '../parser/parseNodeUtils';
import { ParseFileResults } from '../parser/parser';

export enum DefinitionFilter {
    All = 'all',
    PreferSource = 'preferSource',
    PreferStubs = 'preferStubs',
}

class Definition {
    /**
     * @param unfiltered Whether this definition should be ignored (and always retained)
     *                   when filtering definitions.
     */
    constructor(readonly range: DocumentRange, readonly unfiltered: boolean) {}
}

export function addDeclarationsToDefinitions(
    evaluator: TypeEvaluator,
    sourceMapper: SourceMapper,
    declarations: Declaration[] | undefined,
    definitions: Definition[],
    unfiltered: boolean
) {
    if (!declarations) {
        return;
    }

    declarations.forEach((decl) => {
        let resolvedDecl = evaluator.resolveAliasDeclaration(decl, /* resolveLocalNames */ true, {
            allowExternallyHiddenAccess: true,
        });

        if (!resolvedDecl || resolvedDecl.uri.isEmpty()) {
            return;
        }

        // If the decl is an unresolved import, skip it.
        if (resolvedDecl.type === DeclarationType.Alias) {
            if (resolvedDecl.isUnresolved || isUnresolvedAliasDeclaration(resolvedDecl)) {
                return;
            }
        }

        // If the resolved decl is still an alias, it means it
        // resolved to a module. We need to apply loader actions
        // to determine its path.
        if (
            resolvedDecl.type === DeclarationType.Alias &&
            resolvedDecl.symbolName &&
            resolvedDecl.submoduleFallback &&
            !resolvedDecl.submoduleFallback.uri.isEmpty()
        ) {
            resolvedDecl = resolvedDecl.submoduleFallback;
        }

        _addIfUnique(definitions, { uri: resolvedDecl.uri, range: resolvedDecl.range }, unfiltered);

        if (!isStubFile(resolvedDecl.uri)) {
            return;
        }

        if (resolvedDecl.type === DeclarationType.Alias) {
            // Add matching source module
            sourceMapper
                .findModules(resolvedDecl.uri)
                .map((m) => getFileInfo(m)?.fileUri)
                .filter(isDefined)
                .forEach((f) => _addIfUnique(definitions, _createModuleEntry(f), unfiltered));
            return;
        }

        const implDecls = sourceMapper.findDeclarations(resolvedDecl);
        for (const implDecl of implDecls) {
            if (implDecl && !implDecl.uri.isEmpty()) {
                _addIfUnique(definitions, { uri: implDecl.uri, range: implDecl.range }, unfiltered);
            }
        }
    });
}

export function filterDefinitions(filter: DefinitionFilter, definitions: Definition[]) {
    if (filter === DefinitionFilter.All) {
        return definitions.map((definition) => definition.range);
    }

    // If go-to-declaration is supported, attempt to only show only pyi files in go-to-declaration
    // and none in go-to-definition, unless filtering would produce an empty list.
    // Definitions marked as `unfiltered` are ignored when deciding whether to filter and are
    // always retained when filtering.
    const preferStubs = filter === DefinitionFilter.PreferStubs;
    if (definitions.find((definition) => !definition.unfiltered && preferStubs === isStubFile(definition.range.uri))) {
        return definitions
            .filter((definition) => definition.unfiltered || preferStubs === isStubFile(definition.range.uri))
            .map((definition) => definition.range);
    }

    return definitions.map((definition) => definition.range);
}

class DefinitionProviderBase {
    protected constructor(
        protected readonly sourceMapper: SourceMapper,
        protected readonly evaluator: TypeEvaluator,
        private readonly _serviceProvider: ServiceProvider | undefined,
        protected readonly node: ParseNode | undefined,
        protected readonly offset: number,
        private readonly _filter: DefinitionFilter,
        protected readonly token: CancellationToken
    ) {}

    getDefinitionsForNode(node: ParseNode, offset: number) {
        throwIfCancellationRequested(this.token);

        const definitions: Definition[] = [];

        const factories = this._serviceProvider?.tryGet(ServiceKeys.symbolDefinitionProvider);
        if (factories) {
            factories.forEach((f) => {
                const declarations = f.tryGetDeclarations(node, offset, this.token);
                this.resolveDeclarations(declarations, definitions);
            });
        }

        // There should be only one 'definition', so only if extensions failed should we try again.
        // Go up the parse tree until we find a node that we can a definition for.
        let currentNode: ParseNode | undefined = improveNodeByOffset(node, offset);
        while (definitions.length === 0 && currentNode) {
            const infoNode: ParseNode | undefined = getInfoNode(currentNode);

            switch (infoNode.nodeType) {
                case ParseNodeType.Name: {
                    const declInfo = this.evaluator.getDeclInfoForNameNode(infoNode);
                    if (declInfo) {
                        this.resolveDeclarations(declInfo.decls, definitions);
                        this.addSynthesizedTypes(declInfo.synthesizedTypes, definitions);
                    }
                    break;
                }
                case ParseNodeType.String: {
                    const declInfo = this.evaluator.getDeclInfoForStringNode(infoNode);
                    if (declInfo) {
                        this.resolveDeclarations(declInfo.decls, definitions);
                        this.addSynthesizedTypes(declInfo.synthesizedTypes, definitions);
                    }
                    break;
                }
                case ParseNodeType.UnaryOperation: {
                    const result = getTypeOfUnaryOperation(this.evaluator, infoNode, EvalFlags.None, undefined);
                    this.resolveTypeResult(result, definitions);
                    break;
                }
                case ParseNodeType.BinaryOperation: {
                    const result = getTypeOfBinaryOperation(this.evaluator, infoNode, EvalFlags.None, undefined);
                    this.resolveTypeResult(result, definitions);
                    break;
                }
                case ParseNodeType.AugmentedAssignment: {
                    const result = getTypeOfAugmentedAssignment(this.evaluator, infoNode, undefined);
                    this.resolveTypeResult(result, definitions);
                    break;
                }
                case ParseNodeType.Index: {
                    const result = getTypeOfIndex(this.evaluator, infoNode);
                    this.resolveTypeResult(result, definitions);
                    break;
                }
            }

            // In an assignment, the parents represent sub-assignments, i.e. for an assignment `a = b = 2`,
            // if `currentNode` represents the assignment to `a`, its parent represents the assignment to `b`.
            // Therefore, going to the parent to find definitions is not sensible for assignments.
            if (currentNode.nodeType === ParseNodeType.Assignment) {
                break;
            }
            currentNode = currentNode.parent;
        }

        if (definitions.length === 0) {
            return undefined;
        }

        return filterDefinitions(this._filter, definitions);
    }

    protected resolveDeclarations(
        declarations: Declaration[] | undefined,
        definitions: Definition[],
        unfiltered: boolean = false
    ) {
        addDeclarationsToDefinitions(this.evaluator, this.sourceMapper, declarations, definitions, unfiltered);
    }
    protected resolveTypeResult(typeResult: TypeResult, definitions: Definition[]) {
        // If there is information about the `TypedDict` items used, that takes precedence.
        if (typeResult.typedDictItemInfos && typeResult.typedDictItemInfos.length > 0) {
            typeResult.typedDictItemInfos.forEach((member) => {
                if (member.magicMethod.shared.declaration) {
                    this.resolveDeclarations([member.magicMethod.shared.declaration], definitions, false);
                }
                if (member.declaration) {
                    this.resolveDeclarations([member.declaration], definitions, true);
                }
            });
        } else {
            const declarations = typeResult.overloadsUsedForCall
                ?.map((type) => type.shared.declaration)
                .filter((decl) => decl !== undefined);
            this.resolveDeclarations(declarations, definitions);
        }
    }

    protected addSynthesizedTypes(synthTypes: SynthesizedTypeInfo[], definitions: Definition[]) {
        for (const synthType of synthTypes) {
            if (!synthType.node) {
                continue;
            }

            const fileInfo = getFileInfo(synthType.node);
            const range = convertOffsetsToRange(
                synthType.node.start,
                synthType.node.start + synthType.node.length,
                fileInfo.lines
            );

            definitions.push(new Definition({ uri: fileInfo.fileUri, range }, false));
        }
    }
}

export class DefinitionProvider extends DefinitionProviderBase {
    constructor(
        program: ProgramView,
        fileUri: Uri,
        position: Position,
        filter: DefinitionFilter,
        token: CancellationToken
    ) {
        const sourceMapper = program.getSourceMapper(fileUri, token);
        const parseResults = program.getParseResults(fileUri);
        const { node, offset } = _tryGetNode(parseResults, position);

        super(sourceMapper, program.evaluator!, program.serviceProvider, node, offset, filter, token);
    }

    static getDefinitionsForNode(
        sourceMapper: SourceMapper,
        evaluator: TypeEvaluator,
        node: ParseNode,
        offset: number,
        token: CancellationToken
    ) {
        const provider = new DefinitionProviderBase(
            sourceMapper,
            evaluator,
            undefined,
            node,
            offset,
            DefinitionFilter.All,
            token
        );
        return provider.getDefinitionsForNode(node, offset);
    }

    getDefinitions(): DocumentRange[] | undefined {
        if (this.node === undefined) {
            return undefined;
        }

        return this.getDefinitionsForNode(this.node, this.offset);
    }
}

export class TypeDefinitionProvider extends DefinitionProviderBase {
    private readonly _fileUri: Uri;

    constructor(program: ProgramView, fileUri: Uri, position: Position, token: CancellationToken) {
        const sourceMapper = program.getSourceMapper(fileUri, token, /*mapCompiled*/ false, /*preferStubs*/ true);
        const parseResults = program.getParseResults(fileUri);
        const { node, offset } = _tryGetNode(parseResults, position);

        super(sourceMapper, program.evaluator!, program.serviceProvider, node, offset, DefinitionFilter.All, token);
        this._fileUri = fileUri;
    }

    getDefinitions(): DocumentRange[] | undefined {
        throwIfCancellationRequested(this.token);
        if (this.node === undefined) {
            return undefined;
        }

        const definitions: Definition[] = [];

        if (this.node.nodeType === ParseNodeType.Name) {
            const type = this.evaluator.getType(this.node);

            if (type) {
                let declarations: Declaration[] = [];

                doForEachSubtype(type, (subtype) => {
                    if (subtype?.category === TypeCategory.Class) {
                        appendArray(
                            declarations,
                            this.sourceMapper.findClassDeclarationsByType(this._fileUri, subtype)
                        );
                    }
                });

                // Fall back to Go To Definition if the type can't be found (ex. Go To Type Definition
                // was executed on a type name)
                if (declarations.length === 0) {
                    declarations = this.evaluator.getDeclInfoForNameNode(this.node)?.decls ?? [];
                }

                this.resolveDeclarations(declarations, definitions);
            }
        } else if (this.node.nodeType === ParseNodeType.String) {
            const declarations = this.evaluator.getDeclInfoForStringNode(this.node)?.decls;
            this.resolveDeclarations(declarations, definitions);
        }

        if (definitions.length === 0) {
            return undefined;
        }

        return definitions.map((definition) => definition.range);
    }
}

function _tryGetNode(parseResults: ParseFileResults | undefined, position: Position) {
    if (!parseResults) {
        return { node: undefined, offset: 0 };
    }

    const offset = convertPositionToOffset(position, parseResults.tokenizerOutput.lines);
    if (offset === undefined) {
        return { node: undefined, offset: 0 };
    }

    return { node: ParseTreeUtils.findNodeByOffset(parseResults.parserOutput.parseTree, offset), offset };
}

function _createModuleEntry(uri: Uri): DocumentRange {
    return {
        uri,
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
        },
    };
}

function _addIfUnique(definitions: Definition[], itemToAdd: DocumentRange, unfiltered: boolean) {
    for (const def of definitions) {
        if (def.range.uri.equals(itemToAdd.uri) && rangesAreEqual(def.range.range, itemToAdd.range)) {
            return;
        }
    }

    definitions.push(new Definition(itemToAdd, unfiltered));
}
