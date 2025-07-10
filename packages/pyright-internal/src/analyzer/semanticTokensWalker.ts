import { ParseTreeWalker } from './parseTreeWalker';
import { TypeEvaluator } from './typeEvaluatorTypes';
import { ClassType, FunctionType, getTypeAliasInfo, OverloadedType, Type, TypeBase, TypeCategory } from './types';
import {
    ClassNode,
    DecoratorNode,
    FunctionNode,
    ImportAsNode,
    ImportFromAsNode,
    ImportFromNode,
    NameNode,
    ParameterNode,
    ParseNodeType,
    TypeAliasNode,
} from '../parser/parseNodes';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isConstantName } from './symbolNameUtils';
import { CustomSemanticTokenModifiers, CustomSemanticTokenTypes } from '../languageService/semanticTokensProvider';
import { isFunctionDeclaration, isAliasDeclaration, isParamDeclaration } from './declaration';
import { getScopeForNode } from './scopeUtils';
import { ScopeType } from './scope';
import { assertNever } from '../common/debug';
import { getDeclaration } from './analyzerNodeInfo';

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
        this._addItemForNameNode(node.d.name, SemanticTokenTypes.class, [SemanticTokenModifiers.definition]);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const modifiers = [SemanticTokenModifiers.definition];
        if (node.d.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        const decl = getDeclaration(node);
        if (decl && isFunctionDeclaration(decl) && decl.isMethod) {
            this._addItemForNameNode(node.d.name, SemanticTokenTypes.method, modifiers);
        } else {
            this._addItemForNameNode(node.d.name, SemanticTokenTypes.function, modifiers);
        }
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.d.name) {
            const type = this._evaluator?.getType(node.d.name);
            this._addItemForNameNode(node.d.name, this._getParamSemanticToken(node, type), [
                SemanticTokenModifiers.definition,
            ]);
        }
        return super.visitParameter(node);
    }

    override visitDecorator(node: DecoratorNode) {
        this._addItem(node.start, 1 /* '@' symbol */, SemanticTokenTypes.decorator, []);
        // only add the decorator token type if it's just a name (eg. `@property`). any more complicated
        // decorator expressions (eg. `@foo.setter`, `@mark.parametrize("foo", (bar, baz))`) are left
        // as-is and their individual symbols are highlighted with their normal token type.
        // see discussion in https://github.com/DetachHead/basedpyright/issues/278#issuecomment-2517502311
        if (node.d.expr.nodeType === ParseNodeType.Name) {
            this._addItemForNameNode(node.d.expr, SemanticTokenTypes.decorator, []);
        }
        return super.visitDecorator(node);
    }

    override visitImportAs(node: ImportAsNode): boolean {
        for (const part of node.d.module.d.nameParts) {
            this._addItemForNameNode(part, SemanticTokenTypes.namespace, []);
        }
        if (node.d.alias) {
            this._addItemForNameNode(node.d.alias, SemanticTokenTypes.namespace, []);
        }
        return super.visitImportAs(node);
    }

    override visitImportFromAs(node: ImportFromAsNode): boolean {
        const type = this._evaluator?.getType(node.d.alias ?? node.d.name);
        if (type) {
            this._visitNameWithType(node.d.name, type);
            if (node.d.alias) {
                this._visitNameWithType(node.d.alias, type);
            }
        }
        return super.visitImportFromAs(node);
    }

    override visitImportFrom(node: ImportFromNode): boolean {
        for (const part of node.d.module.d.nameParts) {
            this._addItemForNameNode(part, SemanticTokenTypes.namespace, []);
        }
        return super.visitImportFrom(node);
    }

    override visitName(node: NameNode): boolean {
        const parentType = node.parent?.nodeType;
        if (
            parentType !== ParseNodeType.Class &&
            parentType !== ParseNodeType.Decorator &&
            parentType !== ParseNodeType.ImportAs &&
            parentType !== ParseNodeType.ImportFromAs &&
            // Ensure only `parent.d.name` is skipped, e.g. don't skip `returnAnnotation` in `FunctionNode`
            (parentType !== ParseNodeType.Function || node.parent.d.name?.id !== node.id) &&
            (parentType !== ParseNodeType.Parameter || node.parent.d.name?.id !== node.id)
        ) {
            const type = this._evaluator?.getType(node);
            if (type) {
                this._visitNameWithType(node, type);
            }
        }
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

    private _visitNameWithType(node: NameNode, type: Type) {
        switch (type.category) {
            case TypeCategory.Any:
                if (type.props?.specialForm) {
                    this._addItemForNameNode(node, SemanticTokenTypes.type, []);
                    return;
                }
                break;
            // these are handled below
            case TypeCategory.Unknown:
            case TypeCategory.TypeVar:
            case TypeCategory.Never:
                break;
            case TypeCategory.Unbound:
                return;
            case TypeCategory.Function:
                this._visitFunctionWithType(node, type);
                return;
            case TypeCategory.Overloaded:
                this._visitFunctionWithType(node, OverloadedType.getOverloads(type)[0]);
                return;
            case TypeCategory.Module:
                this._addItemForNameNode(node, SemanticTokenTypes.namespace, []);
                return;
            case TypeCategory.Union:
                if (!TypeBase.isInstance(type)) {
                    this._addItemForNameNode(node, SemanticTokenTypes.type, []);
                    return;
                }
                break;
            case TypeCategory.Class:
                //type annotations handled by visitTypeAnnotation
                if (!TypeBase.isInstance(type)) {
                    // Exclude type aliases:
                    // PEP 613 > Name: TypeAlias = Types
                    // PEP 695 > type Name = Types
                    const declarations = this._evaluator?.getDeclInfoForNameNode(node)?.decls;
                    const isPEP613TypeAlias = declarations?.some((declaration) =>
                        this._evaluator?.isExplicitTypeAliasDeclaration(declaration)
                    );
                    const isTypeAlias = isPEP613TypeAlias || type.props?.typeAliasInfo?.shared.isTypeAliasType;

                    const isBuiltIn =
                        (!isTypeAlias &&
                            this.builtinModules.has(type.shared.moduleName) &&
                            type.priv.aliasName === undefined) ||
                        (type.props?.typeAliasInfo?.shared.moduleName &&
                            this.builtinModules.has(type.props.typeAliasInfo.shared.moduleName));

                    const modifiers = isBuiltIn
                        ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                        : [];
                    this._addItemForNameNode(node, SemanticTokenTypes.class, modifiers);
                    return;
                }
                break;
            default:
                assertNever(type);
        }
        const symbol = this._evaluator?.lookUpSymbolRecursive(node, node.d.value, false)?.symbol;
        if (type.category === TypeCategory.Never && symbol) {
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
                this._addItemForNameNode(node, SemanticTokenTypes.type, []);
                return;
            }
        }
        const declarations = this._evaluator?.getDeclInfoForNameNode(node)?.decls;
        const paramNode = declarations?.find(isParamDeclaration)?.node;
        if (paramNode) {
            this._addItemForNameNode(node, this._getParamSemanticToken(paramNode, type), []);
        } else if (type.category === TypeCategory.TypeVar && !TypeBase.isInstance(type)) {
            // `cls` method parameter is treated as a TypeVar in some special methods (methods
            // with @classmethod decorator, `__new__`, `__init_subclass__`, etc.) so we need to
            // check first if it's a parameter before checking that it's a TypeVar
            this._addItemForNameNode(node, SemanticTokenTypes.typeParameter, []);
            return;
        } else if (
            (type.category === TypeCategory.Unknown || type.category === TypeCategory.Any) &&
            (declarations === undefined || declarations.length === 0 || declarations.every(isAliasDeclaration))
        ) {
            return;
        } else if (isConstantName(node.d.value) || (symbol && this._evaluator.isFinalVariable(symbol))) {
            this._addItemForNameNode(node, SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]);
        } else {
            this._addItemForNameNode(node, SemanticTokenTypes.variable, []);
        }
    }

    private _visitFunctionWithType(node: NameNode, type: FunctionType) {
        // type alias to Callable
        if (!TypeBase.isInstance(type)) {
            this._addItemForNameNode(node, SemanticTokenTypes.type, []);
            return;
        }
        if (type.shared.declaration?.isMethod) {
            this._addItemForNameNode(node, SemanticTokenTypes.method, []);
            return;
        }
        const modifiers = this.builtinModules.has(type.shared.moduleName)
            ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
            : [];
        this._addItemForNameNode(node, SemanticTokenTypes.function, modifiers);
    }

    private _getParamSemanticToken(node: ParameterNode, type?: Type): string {
        if (node.parent?.nodeType !== ParseNodeType.Function) {
            return SemanticTokenTypes.parameter;
        }
        if (node.parent.d.params[0].id !== node.id) {
            return SemanticTokenTypes.parameter;
        }

        const parentType = this._evaluator?.getType(node.parent.d.name);
        const isMethodParam =
            parentType?.category === TypeCategory.Function &&
            (FunctionType.isClassMethod(parentType) ||
                FunctionType.isInstanceMethod(parentType) ||
                FunctionType.isConstructorMethod(parentType));

        if (!(isMethodParam && getScopeForNode(node)?.type === ScopeType.Class)) {
            return SemanticTokenTypes.parameter;
        }

        return type && TypeBase.isInstantiable(type)
            ? CustomSemanticTokenTypes.clsParameter
            : CustomSemanticTokenTypes.selfParameter;
    }

    private _addItemForNameNode = (node: NameNode, type: string, modifiers: string[]) =>
        this._addItem(node.d.token.start, node.d.token.length, type, modifiers);

    private _addItem(start: number, length: number, type: string, modifiers: string[]) {
        this.items.push({ type, modifiers, start, length });
    }
}
