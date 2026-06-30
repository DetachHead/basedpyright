/*
 * typeHierarchyProvider.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Logic that provides type hierarchy (supertypes) for overridden methods
 * and class inheritance.
 */

import { CancellationToken, SymbolKind } from 'vscode-languageserver';
import { TypeHierarchyItem } from 'vscode-languageserver-types';

import { getFileInfo } from '../analyzer/analyzerNodeInfo';
import { Declaration } from '../analyzer/declaration';
import * as ParseTreeUtils from '../analyzer/parseTreeUtils';
import { isUserCode } from '../analyzer/sourceFileInfoUtils';
import { ClassNode, FunctionNode, NameNode } from '../parser/parseNodes';
import { MemberAccessFlags, lookUpClassMember } from '../analyzer/typeUtils';
import { ClassType, isInstantiableClass } from '../analyzer/types';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { ProgramView } from '../common/extensibility';
import { convertOffsetsToRange, convertPositionToOffset } from '../common/positionUtils';
import { Position, Range } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { ParseNodeType } from '../parser/parseNodes';
import { ParseFileResults } from '../parser/parser';
import { ClassTreeWalker } from './implementationProvider';

interface MethodContext {
    kind: 'method';
    nameNode: NameNode;
    functionNode: FunctionNode;
    classNode: ClassNode;
}

interface ClassContext {
    kind: 'class';
    nameNode: NameNode;
    classNode: ClassNode;
}

type HierarchyContext = MethodContext | ClassContext;

export class TypeHierarchyProvider {
    private readonly _parseResults: ParseFileResults | undefined;

    constructor(
        private readonly _program: ProgramView,
        private readonly _fileUri: Uri,
        private readonly _position: Position,
        private readonly _token: CancellationToken
    ) {
        this._parseResults = this._program.getParseResults(this._fileUri);
    }

    onPrepare(): TypeHierarchyItem[] | null {
        throwIfCancellationRequested(this._token);
        const ctx = this._getContext();
        if (!ctx) return null;

        if (ctx.kind === 'method') {
            return this._prepareMethod(ctx);
        } else {
            return this._prepareClass(ctx);
        }
    }

    getSupertypes(): TypeHierarchyItem[] | null {
        throwIfCancellationRequested(this._token);
        const ctx = this._getContext();
        if (!ctx) return null;

        if (ctx.kind === 'method') {
            return this._supertypesMethod(ctx);
        } else {
            return this._supertypesClass(ctx);
        }
    }

    getSubtypes(): TypeHierarchyItem[] | null {
        throwIfCancellationRequested(this._token);
        const ctx = this._getContext();
        if (!ctx) return null;

        if (ctx.kind === 'method') {
            return this._subtypesMethod(ctx);
        } else {
            return this._subtypesClass(ctx);
        }
    }

    // LSP spec: range must enclose the full declaration; selectionRange (the name) must be contained within it.
    // decl.range is always the name range, so we recompute range from the AST node.
    private _fullRangeForDecl(decl: Declaration): Range {
        const lines = this._program.getParseResults(decl.uri)?.tokenizerOutput.lines;
        if (!lines) return decl.range;
        return convertOffsetsToRange(decl.node.start, decl.node.start + decl.node.length, lines);
    }

    private _getClassType(classNode: ClassNode): ClassType | undefined {
        const classType = this._program.evaluator?.getTypeOfClass(classNode)?.classType;
        return classType && isInstantiableClass(classType) ? classType : undefined;
    }

    private _walkDirectSubclasses(classType: ClassType, callback: (foundClass: ClassType) => void): void {
        for (const fileInfo of this._program.getSourceFileInfoList()) {
            throwIfCancellationRequested(this._token);
            if (!isUserCode(fileInfo) && !fileInfo.isOpenByClient) continue;
            if (fileInfo.contents.indexOf('class') < 0) continue;

            const parseResults = this._program.getParseResults(fileInfo.uri);
            if (!parseResults) continue;

            const walker = new ClassTreeWalker(fileInfo.uri, parseResults, (foundNode) => {
                const foundClass = this._program.evaluator?.getTypeOfClass(foundNode)?.classType;
                if (!foundClass) return;

                const isDirect = foundClass.shared.baseClasses.some(
                    (b) => isInstantiableClass(b) && b.shared === classType.shared
                );
                if (!isDirect) return;

                callback(foundClass);
            });
            walker.walk(parseResults.parserOutput.parseTree);
            this._program.handleMemoryHighUsage();
        }
    }

    private _prepareMethod(ctx: MethodContext): TypeHierarchyItem[] | null {
        const { nameNode, functionNode, classNode } = ctx;
        const methodName = nameNode.d.value;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const fileInfo = getFileInfo(nameNode);
        const nameRange = convertOffsetsToRange(nameNode.start, nameNode.start + nameNode.length, fileInfo.lines);
        const funcRange = convertOffsetsToRange(functionNode.start, functionNode.start + functionNode.length, fileInfo.lines);

        return [
            {
                name: methodName,
                kind: SymbolKind.Method,
                detail: classNode.d.name.d.value,
                uri: fileInfo.fileUri.toString(),
                range: funcRange,
                selectionRange: nameRange,
            },
        ];
    }

    private _prepareClass(ctx: ClassContext): TypeHierarchyItem[] | null {
        const { nameNode, classNode } = ctx;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const fileInfo = getFileInfo(nameNode);
        const nameRange = convertOffsetsToRange(nameNode.start, nameNode.start + nameNode.length, fileInfo.lines);
        const classRange = convertOffsetsToRange(classNode.start, classNode.start + classNode.length, fileInfo.lines);

        return [
            {
                name: nameNode.d.value,
                kind: SymbolKind.Class,
                uri: fileInfo.fileUri.toString(),
                range: classRange,
                selectionRange: nameRange,
            },
        ];
    }

    private _supertypesMethod(ctx: MethodContext): TypeHierarchyItem[] | null {
        const { nameNode, classNode } = ctx;
        const methodName = nameNode.d.value;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const superMember = lookUpClassMember(
            classType,
            methodName,
            MemberAccessFlags.SkipInstanceMembers,
            classType
        );
        if (!superMember || !isInstantiableClass(superMember.classType)) return null;
        if (superMember.classType.shared.fullName === 'builtins.object') return null;

        const decls = superMember.symbol.getDeclarations();
        if (decls.length === 0) return null;

        const superClassName = superMember.classType.shared.name;
        const items: TypeHierarchyItem[] = [];

        for (const decl of decls) {
            if (decl.uri.isEmpty()) continue;

            items.push({
                name: methodName,
                kind: SymbolKind.Method,
                detail: superClassName,
                uri: decl.uri.toString(),
                range: this._fullRangeForDecl(decl),
                selectionRange: decl.range,
            });
        }

        return items.length > 0 ? items : null;
    }

    private _supertypesClass(ctx: ClassContext): TypeHierarchyItem[] | null {
        const { classNode } = ctx;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const items: TypeHierarchyItem[] = [];

        for (const baseClass of classType.shared.baseClasses) {
            if (!isInstantiableClass(baseClass)) continue;
            if (baseClass.shared.fullName === 'builtins.object') continue;
            const decl = baseClass.shared.declaration;
            if (!decl || decl.uri.isEmpty()) continue;

            items.push({
                name: baseClass.shared.name,
                kind: SymbolKind.Class,
                uri: decl.uri.toString(),
                range: this._fullRangeForDecl(decl),
                selectionRange: decl.range,
            });
        }

        return items.length > 0 ? items : null;
    }

    private _subtypesMethod(ctx: MethodContext): TypeHierarchyItem[] | null {
        const { nameNode, classNode } = ctx;
        const methodName = nameNode.d.value;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const items: TypeHierarchyItem[] = [];

        this._walkDirectSubclasses(classType, (foundClass) => {
            const overrideDecls = foundClass.shared.fields.get(methodName)?.getDeclarations();
            if (!overrideDecls || overrideDecls.length === 0) return;

            for (const decl of overrideDecls) {
                if (decl.uri.isEmpty()) continue;
                items.push({
                    name: methodName,
                    kind: SymbolKind.Method,
                    detail: foundClass.shared.name,
                    uri: decl.uri.toString(),
                    range: this._fullRangeForDecl(decl),
                    selectionRange: decl.range,
                });
            }
        });

        return items.length > 0 ? items : null;
    }

    private _subtypesClass(ctx: ClassContext): TypeHierarchyItem[] | null {
        const { classNode } = ctx;

        const classType = this._getClassType(classNode);
        if (!classType) return null;

        const items: TypeHierarchyItem[] = [];

        this._walkDirectSubclasses(classType, (foundClass) => {
            const decl = foundClass.shared.declaration;
            if (!decl || decl.uri.isEmpty()) return;

            items.push({
                name: foundClass.shared.name,
                kind: SymbolKind.Class,
                uri: decl.uri.toString(),
                range: this._fullRangeForDecl(decl),
                selectionRange: decl.range,
            });
        });

        return items.length > 0 ? items : null;
    }

    private _getContext(): HierarchyContext | undefined {
        if (!this._parseResults) return undefined;

        const offset = convertPositionToOffset(this._position, this._parseResults.tokenizerOutput.lines);
        if (offset === undefined) return undefined;

        const node = ParseTreeUtils.findNodeByOffset(this._parseResults.parserOutput.parseTree, offset);
        if (!node || node.nodeType !== ParseNodeType.Name) return undefined;

        // Method context: cursor on function name inside a class def
        const maybeFn = node.parent;
        if (maybeFn?.nodeType === ParseNodeType.Function && maybeFn.d.name === node) {
            const classNode = ParseTreeUtils.getEnclosingClass(maybeFn, true);
            if (classNode) {
                return { kind: 'method', nameNode: node, functionNode: maybeFn, classNode };
            }
        }

        // Class context: cursor on class name in a class def
        const maybeClass = node.parent;
        if (maybeClass?.nodeType === ParseNodeType.Class && maybeClass.d.name === node) {
            return { kind: 'class', nameNode: node, classNode: maybeClass };
        }

        // Type reference context: cursor on a type name used in an annotation (x: Foo, def f(x: Foo), -> Foo)
        // Resolve to the class definition so the hierarchy is rooted there, not at the usage site.
        const type = this._program.evaluator?.getType(node);
        if (!type || !isInstantiableClass(type)) return undefined;
        if (type.shared.fullName.startsWith('builtins.')) return undefined;
        const decl = type.shared.declaration;
        if (decl?.node.nodeType === ParseNodeType.Class) {
            return { kind: 'class', nameNode: decl.node.d.name, classNode: decl.node };
        }

        return undefined;
    }
}
