import { ParseTreeWalker } from './parseTreeWalker';
import { TypeEvaluator } from './typeEvaluatorTypes';
import { ClassType, FunctionType, OverloadedFunctionType, Type, TypeCategory, TypeFlags } from './types';
import {
    ClassNode,
    DecoratorNode,
    FunctionNode,
    ImportAsNode,
    ImportFromAsNode,
    ImportFromNode,
    LambdaNode,
    NameNode,
    ParameterNode,
    ParseNodeType,
    TypeAliasNode,
} from '../parser/parseNodes';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isConstantName } from './symbolNameUtils';
import { CustomSemanticTokenModifiers } from '../languageService/semanticTokensProvider';
import { isParameterDeclaration } from './declaration';

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
        this._addItem(node.name.start, node.name.length, SemanticTokenTypes.class, [SemanticTokenModifiers.definition]);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const modifiers = [SemanticTokenModifiers.definition];
        if (node.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        //TODO: whats the correct type here
        if ((node as any).declaration?.isMethod) {
            this._addItem(node.name.start, node.name.length, SemanticTokenTypes.method, modifiers);
        } else {
            this._addItem(node.name.start, node.name.length, SemanticTokenTypes.function, modifiers);
        }
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.name) {
            this._addItem(node.name.start, node.name.length, SemanticTokenTypes.parameter, [
                SemanticTokenModifiers.definition,
            ]);
        }
        return super.visitParameter(node);
    }

    override visitDecorator(node: DecoratorNode) {
        let nameNode: NameNode | undefined;
        this._addItem(node.start, 1 /* '@' symbol */, SemanticTokenTypes.decorator, []);
        switch (node.expression.nodeType) {
            case ParseNodeType.Call:
                if (node.expression.leftExpression.nodeType === ParseNodeType.MemberAccess) {
                    nameNode = node.expression.leftExpression.memberName;
                } else if (node.expression.leftExpression.nodeType === ParseNodeType.Name) {
                    nameNode = node.expression.leftExpression;
                }
                break;
            case ParseNodeType.MemberAccess:
                nameNode = node.expression.memberName;
                break;
            case ParseNodeType.Name:
                nameNode = node.expression;
                break;
        }
        if (nameNode) {
            this._addItem(nameNode.start, nameNode.length, SemanticTokenTypes.decorator, []);
        }
        return super.visitDecorator(node);
    }

    override visitImportAs(node: ImportAsNode): boolean {
        for (const part of node.module.nameParts) {
            this._addItem(part.start, part.length, SemanticTokenTypes.namespace, []);
        }
        if (node.alias) {
            this._addItem(node.alias.start, node.alias.length, SemanticTokenTypes.namespace, []);
        }
        return super.visitImportAs(node);
    }

    override visitImportFromAs(node: ImportFromAsNode): boolean {
        this._visitNameWithType(node.name, this._evaluator?.getType(node.alias ?? node.name));
        return super.visitImportFromAs(node);
    }

    override visitImportFrom(node: ImportFromNode): boolean {
        for (const part of node.module.nameParts) {
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
                    if ((type as FunctionType).details.declaration?.isMethod) {
                        this._addItem(node.start, node.length, SemanticTokenTypes.method, []);
                    } else {
                        const modifiers = this.builtinModules.has(type.details.moduleName)
                            ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                            : [];
                        this._addItem(node.start, node.length, SemanticTokenTypes.function, modifiers);
                    }
                } else {
                    // type alias to Callable
                    this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                }
                return;
            case TypeCategory.OverloadedFunction:
                if (type.flags & TypeFlags.Instance) {
                    const details = OverloadedFunctionType.getOverloads(type)[0].details;
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
                if (type.specialForm) {
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
                if (!(type.flags & TypeFlags.Instance)) {
                    // Exclude type aliases:
                    // PEP 613 > Name: TypeAlias = Types
                    // PEP 695 > type Name = Types
                    const declarations = this._evaluator?.getDeclarationsForNameNode(node);
                    const isPEP613TypeAlias =
                        declarations &&
                        declarations.some((declaration) =>
                            this._evaluator?.isExplicitTypeAliasDeclaration(declaration)
                        );
                    const isTypeAlias = isPEP613TypeAlias || type.typeAliasInfo?.isPep695Syntax;

                    const isBuiltIn =
                        (!isTypeAlias &&
                            this.builtinModules.has(type.details.moduleName) &&
                            type.aliasName === undefined) ||
                        (type.typeAliasInfo?.moduleName && this.builtinModules.has(type.typeAliasInfo.moduleName));

                    const modifiers = isBuiltIn
                        ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
                        : [];
                    this._addItem(node.start, node.length, SemanticTokenTypes.class, modifiers);
                    return;
                }
        }
        const symbol = this._evaluator?.lookUpSymbolRecursive(node, node.value, false)?.symbol;
        if (type?.category === TypeCategory.Never && symbol) {
            const typeResult = this._evaluator?.getEffectiveTypeOfSymbolForUsage(symbol, node);
            if (
                // check for new python 3.12 type alias syntax
                (typeResult.type.specialForm && ClassType.isBuiltIn(typeResult.type.specialForm, 'TypeAliasType')) ||
                // for some reason Never is considered both instantiable and an instance, so we need a way
                // to differentiate between "instances" of `Never` and type aliases/annotations of Never.
                // this is probably extremely cringe since i have no idea what this is doing and i literally
                // just brute forced random shit until all the tests passed
                (typeResult.type.category !== TypeCategory.Never &&
                    typeResult.type.category !== TypeCategory.Unbound &&
                    typeResult.type.flags & TypeFlags.Instantiable) ||
                (typeResult.type.category === TypeCategory.Unbound && !typeResult.includesIllegalTypeAliasDecl)
            ) {
                this._addItem(node.start, node.length, SemanticTokenTypes.type, []);
                return;
            }
        }
        const declarations = this._evaluator?.getDeclarationsForNameNode(node);
        if (declarations?.some(isParameterDeclaration)) {
            const parent = declarations[0].node.parent as FunctionNode | LambdaNode;
            // Avoid duplicates for parameters visited by `visitParameter`
            if (!parent.parameters.some((param) => param.name?.id === node.id)) {
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
            (declarations === undefined || declarations.length === 0)
        ) {
            return;
        } else if (isConstantName(node.value) || (symbol && this._evaluator.isFinalVariable(symbol))) {
            this._addItem(node.start, node.length, SemanticTokenTypes.variable, [SemanticTokenModifiers.readonly]);
        } else {
            this._addItem(node.start, node.length, SemanticTokenTypes.variable, []);
        }
    }

    private _addItem(start: number, length: number, type: string, modifiers: string[]) {
        this.items.push({ type, modifiers, start, length });
    }
}
