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
    MemberAccessNode,
    NameNode,
    ParameterNode,
    ParseNodeType,
    TypeAliasNode,
} from '../parser/parseNodes';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isConstantName } from './symbolNameUtils';
import { CustomSemanticTokenModifiers, CustomSemanticTokenTypes } from '../languageService/semanticTokensProvider';
import {
    Declaration,
    DeclarationType,
    isFunctionDeclaration,
    isAliasDeclaration,
    isParamDeclaration,
    isVariableDeclaration,
} from './declaration';
import { getScopeForNode } from './scopeUtils';
import { ScopeType } from './scope';
import { assertNever } from '../common/debug';
import { getDeclaration } from './analyzerNodeInfo';
import { isDeclInEnumClass } from './enums';
import { getEnclosingClass } from './parseTreeUtils';
import { Symbol } from './symbol';
import { ClassMember, MemberAccessFlags, isMaybeDescriptorInstance, lookUpClassMember } from './typeUtils';

export type SemanticTokenItem = {
    type: string;
    modifiers: string[];
    start: number;
    length: number;
};

type Modifiers = SemanticTokenModifiers | CustomSemanticTokenModifiers;

// the magic attribute methods that apply to a given member access, with the relevant one
// (e.g. “set” when the member access is the left-hand side of an assignment) stored separately
interface MagicAttributeAccess {
    del: ClassMember | undefined;
    get: ClassMember | undefined;
    set: ClassMember | undefined;
}

export class SemanticTokensWalker extends ParseTreeWalker {
    builtinModules = new Set<string>(['builtins', '__builtins__']);
    items: SemanticTokenItem[] = [];

    constructor(private readonly _evaluator: TypeEvaluator) {
        super();
    }
    override visitClass(node: ClassNode): boolean {
        const tokenType = this._getClassTokenType(this._evaluator.getTypeOfClass(node)?.classType);
        this._addItemForNameNode(node.d.name, tokenType, [SemanticTokenModifiers.declaration]);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const modifiers = [SemanticTokenModifiers.declaration];
        if (node.d.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        const decl = getDeclaration(node);
        const tokenType = this._getFunctionTokenType(decl, undefined, modifiers);
        this._addItemForNameNode(node.d.name, tokenType, modifiers);
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.d.name) {
            const type = this._evaluator.getType(node.d.name);
            this._addItemForNameNode(node.d.name, this._getParamSemanticToken(node, type), [
                SemanticTokenModifiers.declaration,
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
        const type = this._evaluator.getType(node.d.alias ?? node.d.name);
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
            const type = this._evaluator.getType(node);
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
                // type annotations handled by visitTypeAnnotation
                if (!TypeBase.isInstance(type)) {
                    // Exclude type aliases:
                    // PEP 613 > Name: TypeAlias = Types
                    // PEP 695 > type Name = Types
                    const declarations = this._evaluator.getDeclInfoForNameNode(node)?.decls;
                    const isPEP613TypeAlias = declarations?.some((declaration) =>
                        this._evaluator.isExplicitTypeAliasDeclaration(declaration)
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
                    this._addItemForNameNode(node, this._getClassTokenType(type), modifiers);
                    return;
                }
                break;
            default:
                assertNever(type);
        }
        const symbol = this._evaluator.lookUpSymbolRecursive(node, node.d.value, false)?.symbol;
        if (type.category === TypeCategory.Never && symbol) {
            const typeResult = this._evaluator.getEffectiveTypeOfSymbolForUsage(symbol, node);
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

        const declarations = this._evaluator.getDeclInfoForNameNode(node)?.decls ?? [];
        const modifiers: Modifiers[] =
            node.nodeType === ParseNodeType.Name &&
            declarations.some((declaration) => declaration.moduleName.split('.').pop() === '__builtins__')
                ? [CustomSemanticTokenModifiers.builtin]
                : [];
        const paramNode = declarations.find(isParamDeclaration)?.node;
        if (paramNode) {
            this._addItemForNameNode(node, this._getParamSemanticToken(paramNode, type), modifiers);
            return;
        } else if (type.category === TypeCategory.TypeVar && !TypeBase.isInstance(type)) {
            // `cls` method parameter is treated as a TypeVar in some special methods (methods
            // with @classmethod decorator, `__new__`, `__init_subclass__`, etc.) so we need to
            // check first if it's a parameter before checking that it's a TypeVar
            this._addItemForNameNode(node, SemanticTokenTypes.typeParameter, modifiers);
            return;
        } else if (
            (type.category === TypeCategory.Unknown || type.category === TypeCategory.Any) &&
            declarations.every(isAliasDeclaration)
        ) {
            return;
        }

        const tokenType = this._getVariableTokenType(node, symbol, declarations, modifiers);
        this._addItemForNameNode(node, tokenType, modifiers);
    }

    private _getClassTokenType(classType: ClassType | undefined): SemanticTokenTypes {
        return classType && ClassType.isEnumClass(classType) ? SemanticTokenTypes.enum : SemanticTokenTypes.class;
    }

    private _getVariableTokenType(
        node: NameNode,
        symbol: Symbol | undefined,
        declarations: Declaration[],
        modifiers: Modifiers[]
    ): SemanticTokenTypes {
        // Mark as enumMember if any declaration is in enum class
        const isEnumMember = declarations.some(
            (decl) => isVariableDeclaration(decl) && isDeclInEnumClass(this._evaluator, decl)
        );
        if (isEnumMember) {
            return SemanticTokenTypes.enumMember;
        }
        // Track whether “readonly” has already been added to “modifiers”
        let readOnly = false;
        // Mark as “readonly” if one of the following applies:
        // - the name implies a constant
        // - the symbol represents a final variable
        // - one of the declarations is final
        if (
            isConstantName(node.d.value) ||
            (symbol && this._evaluator.isFinalVariable(symbol)) ||
            declarations.some((decl) => this._isFinal(decl))
        ) {
            readOnly = true;
            modifiers.push(SemanticTokenModifiers.readonly);
        }
        // Mark as property if any declaration is within a class
        // “property” is used even for class variables because there is no more appropriate token type
        // (see https://github.com/DetachHead/basedpyright/issues/482#issuecomment-3172601227)
        const enclosingClass = declarations.some((decl) => getEnclosingClass(decl.node, /*stopAtFunction*/ true));
        if (enclosingClass) {
            // if every declaration has a property type, but does not contain fset information, mark as “readonly”
            if (!readOnly && declarations.every((d) => this._missingPropertySetter(d))) {
                modifiers.push(SemanticTokenModifiers.readonly);
            }
            return SemanticTokenTypes.property;
        }
        // All member accesses to variables are interpreted as properties
        const parent = node.parent;
        if (parent?.nodeType === ParseNodeType.MemberAccess && parent.d.member === node) {
            // This is quite a primitive heuristic for determining member accesses through magic methods,
            // but since it is only used to check for read-only access, it should be sufficient
            if (declarations.length === 0) {
                // If there are no declarations, we check whether the access uses magic methods
                // To determine whether the magic method access is read-only, check if there is
                // a magic getter (__getattr__ or __getattribute__) but no magic setter (__setattr__)
                const access = this._getMagicAttributeAccess(parent);
                if (!readOnly && access && access.get && !access.set) {
                    modifiers.push(SemanticTokenModifiers.readonly);
                }
            }
            return SemanticTokenTypes.property;
        }
        return SemanticTokenTypes.variable;
    }

    // For a given attribute access, gather information about the magic attribute methods
    // which the left-hand side provides
    private _getMagicAttributeAccess(node: MemberAccessNode): MagicAttributeAccess | undefined {
        const baseType = this._evaluator.getType(node.d.leftExpr);
        if (baseType && baseType.category === TypeCategory.Class) {
            // Skip the object base class because that always appears to contain these members
            const del = lookUpClassMember(baseType, '__delattr__', MemberAccessFlags.SkipObjectBaseClass);
            const set = lookUpClassMember(baseType, '__setattr__', MemberAccessFlags.SkipObjectBaseClass);
            const get =
                lookUpClassMember(baseType, '__getattribute__', MemberAccessFlags.SkipObjectBaseClass) ??
                lookUpClassMember(baseType, '__getattr__', MemberAccessFlags.SkipObjectBaseClass);
            return { del: del, get: get, set: set };
        }
        return undefined;
    }

    // Check whether “decl” is a final variable declaration (with alias resolution)
    private _isFinal(decl: Declaration): boolean {
        if (decl.type === DeclarationType.Alias) {
            const rdecl = this._evaluator.resolveAliasDeclaration(decl, true);
            if (rdecl) decl = rdecl;
        }
        if (decl.type === DeclarationType.Variable) {
            return !!decl.isFinal || this._evaluator.isFinalVariableDeclaration(decl);
        }
        return false;
    }

    // Check whether “decl” has a property type and does not contain fset information
    private _missingPropertySetter(decl: Declaration): boolean {
        const type = this._evaluator.getTypeForDeclaration(decl).type;
        if (type?.category === TypeCategory.Class && ClassType.isPropertyClass(type)) {
            return !type.priv.fsetInfo;
        }
        return false;
    }

    private _visitFunctionWithType(node: NameNode, type: FunctionType) {
        // type alias to Callable
        if (!TypeBase.isInstance(type)) {
            this._addItemForNameNode(node, SemanticTokenTypes.type, []);
            return;
        }
        const modifiers = this.builtinModules.has(type.shared.moduleName)
            ? [SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin]
            : [];
        const tokenType = this._getFunctionTokenType(type.shared.declaration, type, modifiers);
        this._addItemForNameNode(node, tokenType, modifiers);
    }

    private _getFunctionTokenType(
        decl: Declaration | undefined,
        functionType: FunctionType | undefined,
        modifiers: Modifiers[]
    ): SemanticTokenTypes {
        if (decl && isFunctionDeclaration(decl)) {
            if (!functionType) functionType = this._evaluator.getTypeOfFunction(decl.node)?.functionType;
            if (functionType && FunctionType.isStaticMethod(functionType))
                modifiers.push(SemanticTokenModifiers.static);
            if (decl.isMethod) {
                const declaredType = this._evaluator.getTypeForDeclaration(decl)?.type;
                // the canonical check for properties (used e.g. in the hover message)
                if (declaredType && isMaybeDescriptorInstance(declaredType)) {
                    return SemanticTokenTypes.property;
                }
                return SemanticTokenTypes.method;
            }
        }
        return SemanticTokenTypes.function;
    }

    private _getParamSemanticToken(node: ParameterNode, type?: Type): string {
        if (node.parent?.nodeType !== ParseNodeType.Function) {
            return SemanticTokenTypes.parameter;
        }
        if (node.parent.d.params[0].id !== node.id) {
            return SemanticTokenTypes.parameter;
        }

        const parentType = this._evaluator.getType(node.parent.d.name);
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
