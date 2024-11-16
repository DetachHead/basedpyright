import { ParseTreeWalker } from './parseTreeWalker';
import { TypeEvaluator } from './typeEvaluatorTypes';
import {
    ClassType,
    ClassTypeFlags,
    FunctionType,
    getTypeAliasInfo,
    isClass,
    OverloadedType,
    Type,
    TypeCategory,
    TypeFlags,
} from './types';
import {
    ClassNode,
    DecoratorNode,
    FunctionNode,
    ImportAsNode,
    ImportFromAsNode,
    ImportFromNode,
    isExpressionNode,
    LambdaNode,
    NameNode,
    ParameterNode,
    ParseNodeType,
    TypeAliasNode,
} from '../parser/parseNodes';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isConstantName } from './symbolNameUtils';
import { CustomSemanticTokenModifiers } from '../languageService/semanticTokensProvider';
import { isAliasDeclaration, isParamDeclaration } from './declaration';

export type SemanticTokenItem = {
    type: string;
    modifiers: string[];
    start: number;
    length: number;
};

export class SemanticTokensWalker extends ParseTreeWalker {
    builtinModules = new Set<string>(['builtins', '__builtins__']);
    items: SemanticTokenItem[] = [];

    constructor(private readonly _evaluator?: TypeEvaluator) {
        super();
    }
    override visitClass(node: ClassNode): boolean {
        this._addItem(node.d.name.start, node.d.name.length, SemanticTokenTypes.class, [
            SemanticTokenModifiers.definition,
        ]);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const modifiers = [SemanticTokenModifiers.definition];
        if (node.d.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        //TODO: whats the correct type here
        if ((node.a as any).declaration?.isMethod) {
            this._addItem(node.d.name.start, node.d.name.length, SemanticTokenTypes.method, modifiers);
        } else {
            this._addItem(node.d.name.start, node.d.name.length, SemanticTokenTypes.function, modifiers);
        }
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.d.name) {
            this._addItem(node.d.name.start, node.d.name.length, SemanticTokenTypes.parameter, [
                SemanticTokenModifiers.definition,
            ]);
        }
        return super.visitParameter(node);
    }

    override visitDecorator(node: DecoratorNode) {
        let nameNode: NameNode | undefined;
        this._addItem(node.start, 1 /* '@' symbol */, SemanticTokenTypes.decorator, []);
        switch (node.d.expr.nodeType) {
            case ParseNodeType.Call:
                if (node.d.expr.d.leftExpr.nodeType === ParseNodeType.MemberAccess) {
                    nameNode = node.d.expr.d.leftExpr.d.member;
                } else if (node.d.expr.d.leftExpr.nodeType === ParseNodeType.Name) {
                    nameNode = node.d.expr.d.leftExpr;
                }
                break;
            case ParseNodeType.MemberAccess:
                nameNode = node.d.expr.d.member;
                break;
            case ParseNodeType.Name:
                nameNode = node.d.expr;
                break;
        }
        if (nameNode) {
            this._addItem(nameNode.start, nameNode.length, SemanticTokenTypes.decorator, []);
        }
        return super.visitDecorator(node);
    }

    override visitImportAs(node: ImportAsNode): boolean {
        for (const part of node.d.module.d.nameParts) {
            this._addItem(part.start, part.length, SemanticTokenTypes.namespace, []);
        }
        if (node.d.alias) {
            this._addItem(node.d.alias.start, node.d.alias.length, SemanticTokenTypes.namespace, []);
        }
        return super.visitImportAs(node);
    }

    override visitImportFromAs(node: ImportFromAsNode): boolean {
        this._visitNameWithType(node.d.name, this._evaluator?.getType(node.d.alias ?? node.d.name));
        return super.visitImportFromAs(node);
    }

    override visitImportFrom(node: ImportFromNode): boolean {
        for (const part of node.d.module.d.nameParts) {
            this._addItem(part.start, part.length, SemanticTokenTypes.namespace, []);
        }
        return super.visitImportFrom(node);
    }

    override visitName(node: NameNode): boolean {
        this._visitNameWithType(node, this._evaluator?.getType(node));
        return super.visitName(node);
    }

    override visitTypeAlias(node: TypeAliasNode): boolean {
        // this shouldn't be needed because keywords are part of syntax highlighting, not semantic highlighting,
        // but vscode incorrectly treats the type keyword as a type instead of a keyword so we need to fix it
        // TODO: keyword makes it purple like `if`, `for`, `import`, etc. but the `type` keyword is more like
        // `def`, `class` and `lambda` which are blue but i can't figure out what semantic token type does that.
        this._addItem(node.start, 4 /* length of the word "type" */, SemanticTokenTypes.keyword, []);
        return super.visitTypeAlias(node);
    }

    private _visitNameWithType(node: NameNode, type: Type | undefined) {
        switch (type?.category) {
            case TypeCategory.Function:
                if (type.flags & TypeFlags.Instance) {
                    if ((type as FunctionType).shared.declaration?.isMethod) {
                        this._addItem(node.start, node.length, SemanticTokenTypes.method, []);
                    } else {
                        const modifiers = this.builtinModules.has(type.shared.moduleName)
                            ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                            : [];
                        this._addItem(node.start, node.length, SemanticTokenTypes.function, modifiers);
                    }
                } else {
                    // type alias to Callable
                    this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                }
                return;
            case TypeCategory.Overloaded:
                if (type.flags & TypeFlags.Instance) {
                    const details = OverloadedType.getOverloads(type)[0].shared;
                    if (details.declaration?.isMethod) {
                        this._addItem(node.start, node.length, SemanticTokenTypes.method, []);
                    } else {
                        const modifiers = this.builtinModules.has(details.moduleName)
                            ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                            : [];
                        this._addItem(node.start, node.length, SemanticTokenTypes.function, modifiers);
                    }
                } else {
                    // dunno if this is possible but better safe than sorry!!!
                    this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                }
                return;

            case TypeCategory.Module:
                this._addItem(node.start, node.length, SemanticTokenTypes.namespace, []);
                return;
            case TypeCategory.Any:
                if (type.props?.specialForm) {
                    this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                    return;
                }
            // eslint-disable-next-line no-fallthrough -- intentional fallthrough. these are handled below
            case TypeCategory.Unknown:
            case TypeCategory.TypeVar:
                break;
            case TypeCategory.Unbound:
            case undefined:
                return;
            case TypeCategory.Union:
                if (!(type.flags & TypeFlags.Instance)) {
                    this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                    return;
                }
                break;
            case TypeCategory.Class:
                //type annotations handled by visitTypeAnnotation
                if (type.flags & TypeFlags.Instance) {
                    if (node.parent && this._evaluator && isExpressionNode(node.parent)) {
                        const declaredType = this._evaluator.getDeclaredTypeForExpression(node.parent, {
                            method: 'set',
                        });
                        if (
                            declaredType &&
                            isClass(declaredType) &&
                            declaredType.shared.flags & ClassTypeFlags.PropertyClass
                        ) {
                            this._addItem(node.start, node.length, SemanticTokenTypes.variable, [
                                SemanticTokenModifiers.readonly,
                            ]);
                            return;
                        }
                    }
                } else {
                    // Exclude type aliases:
                    // PEP 613 > Name: TypeAlias = Types
                    // PEP 695 > type Name = Types
                    const declarations = this._evaluator?.getDeclInfoForNameNode(node)?.decls;
                    const isPEP613TypeAlias =
                        declarations &&
                        declarations.some((declaration) =>
                            this._evaluator?.isExplicitTypeAliasDeclaration(declaration)
                        );
                    const isTypeAlias = isPEP613TypeAlias || type.props?.typeAliasInfo?.shared.isPep695Syntax;

                    const isBuiltIn =
                        (!isTypeAlias &&
                            this.builtinModules.has(type.shared.moduleName) &&
                            type.priv.aliasName === undefined) ||
                        (type.props?.typeAliasInfo?.shared.moduleName &&
                            this.builtinModules.has(type.props.typeAliasInfo.shared.moduleName));

                    const modifiers = isBuiltIn
                        ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                        : [];
                    this._addItem(node.start, node.length, SemanticTokenTypes.class, modifiers);
                    return;
                }
        }
        const symbol = this._evaluator?.lookUpSymbolRecursive(node, node.d.value, false)?.symbol;
        if (type?.category === TypeCategory.Never && symbol) {
            const typeResult = this._evaluator?.getEffectiveTypeOfSymbolForUsage(symbol, node);
            if (
                // check for new python 3.12 type alias syntax
                (typeResult.type.props?.specialForm &&
                    ClassType.isBuiltIn(typeResult.type.props.specialForm, 'TypeAliasType')) ||
                // for some reason Never is considered both instantiable and an instance, so we need a way
                // to differentiate between "instances" of `Never` and type aliases/annotations of Never.
                // this is probably extremely cringe since i have no idea what this is doing and i literally
                // just brute forced random shit until all the tests passed
                (typeResult.type.category === TypeCategory.Never && !typeResult.includesVariableDecl) ||
                (getTypeAliasInfo(type) && !typeResult.includesIllegalTypeAliasDecl)
            ) {
                this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                return;
            }
        }
        const declarations = this._evaluator?.getDeclInfoForNameNode(node)?.decls;
        if (declarations?.some(isParamDeclaration)) {
            const parent = declarations[0].node.parent as FunctionNode | LambdaNode;
            // Avoid duplicates for parameters visited by `visitParameter`
            if (!parent.d.params.some((param) => param.d.name?.id === node.id)) {
                this._addItem(node.start, node.length, SemanticTokenTypes.parameter, []);
            }
        } else if (type?.category === TypeCategory.TypeVar && !(type.flags & TypeFlags.Instance)) {
            // `cls` method parameter is treated as a TypeVar in some special methods (methods
            // with @classmethod decorator, `__new__`, `__init_subclass__`, etc.) so we need to
            // check first if it's a parameter before checking that it's a TypeVar
            this._addItem(node.start, node.length, SemanticTokenTypes.typeParameter, []);
            return;
        } else if (
            (type?.category === TypeCategory.Unknown || type?.category === TypeCategory.Any) &&
            (declarations === undefined || declarations.length === 0 || declarations.every(isAliasDeclaration))
        ) {
            return;
        } else if (isConstantName(node.d.value) || (symbol && this._evaluator.isFinalVariable(symbol))) {
            this._addItem(node.start, node.length, SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]);
        } else {
            this._addItem(node.start, node.length, SemanticTokenTypes.variable, []);
        }
    }

    private _addItem(start: number, length: number, type: string, modifiers: string[]) {
        this.items.push({ type, modifiers, start, length });
    }
}
