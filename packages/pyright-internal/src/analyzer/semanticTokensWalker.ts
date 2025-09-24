import { ParseTreeWalker } from './parseTreeWalker';
import { TypeEvaluator } from './typeEvaluatorTypes';
import {
    ClassType,
    FunctionType,
    getTypeAliasInfo,
    isAny,
    isClassInstance,
    isTypeVar,
    isUnknown,
    OverloadedType,
    Type,
    TypeBase,
    TypeCategory,
} from './types';
import {
    ClassNode,
    DecoratorNode,
    ExpressionNode,
    FunctionNode,
    MemberAccessNode,
    NameNode,
    ParameterNode,
    ParseNodeType,
    TypeAliasNode,
} from '../parser/parseNodes';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import { isConstantName } from './symbolNameUtils';
import { CustomSemanticTokenModifiers, CustomSemanticTokenTypes } from '../languageService/semanticTokensProvider';
import { Declaration, DeclarationType, isFunctionDeclaration, isVariableDeclaration } from './declaration';
import { getScopeForNode } from './scopeUtils';
import { ScopeType } from './scope';
import { assertNever } from '../common/debug';
import { getDeclaration } from './analyzerNodeInfo';
import { isDeclInEnumClass } from './enums';
import { getEnclosingClass } from './parseTreeUtils';
import { ClassMember, MemberAccessFlags, isMaybeDescriptorInstance, lookUpClassMember } from './typeUtils';

type TokenTypes = SemanticTokenTypes | CustomSemanticTokenTypes;
type TokenModifiers = SemanticTokenModifiers | CustomSemanticTokenModifiers;

export type SemanticTokenItem = {
    type: TokenTypes;
    modifiers: TokenModifiers[];
    start: number;
    length: number;
};

// the magic attribute methods that apply to a given member access
interface MagicAttributeAccess {
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
        const decls = this._getNameNodeDeclarations(node.d.name);
        const modifiers: TokenModifiers[] = [SemanticTokenModifiers.declaration];
        const classType = this._evaluator.getTypeOfClass(node)?.classType;
        const tokenType = classType
            ? this._getClassTokenType(classType, decls, modifiers, false)
            : SemanticTokenTypes.class;
        this._addItemForNameNode(node.d.name, tokenType, modifiers);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const modifiers = [SemanticTokenModifiers.declaration];
        if (node.d.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        const decl = getDeclaration(node);
        const tokenType = this._getFunctionTokenType(node.d.name, decl, undefined, modifiers);
        this._addItemForNameNode(node.d.name, tokenType, modifiers);
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.d.name) {
            const type = this._getType(node.d.name);
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

    override visitName(node: NameNode): boolean {
        const parentType = node.parent?.nodeType;
        if (
            parentType !== ParseNodeType.Class &&
            parentType !== ParseNodeType.Decorator &&
            // Ensure only `parent.d.name` is skipped, e.g. don't skip `returnAnnotation` in `FunctionNode`
            (parentType !== ParseNodeType.Function || node.parent.d.name?.id !== node.id) &&
            (parentType !== ParseNodeType.Parameter || node.parent.d.name?.id !== node.id)
        ) {
            this._visitNameWithDeclarations(node, this._getNameNodeDeclarations(node));
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

    private _visitNameWithDeclarations(node: NameNode, declarations: Declaration[]) {
        // Treat the first declaration as the primary one, similar to HoverProvider
        const primaryDecl = declarations.length > 0 ? declarations[0] : undefined;

        // For nodes whose parent is a “ModuleName” node, TypeEvaluator.getType returns a type
        // very inconsistently, and they are always modules anyway, so they are caught early
        if (node.parent?.nodeType === ParseNodeType.ModuleName) {
            this._addItemForNameNode(node, SemanticTokenTypes.namespace, []);
            return;
        }

        switch (primaryDecl?.type) {
            case DeclarationType.Variable: {
                const type = this._getType(node);
                let tokenType: TokenTypes | undefined = undefined;
                const modifiers: TokenModifiers[] = [];
                if (type) tokenType = this._getVariableTokenType(node, type, declarations, modifiers);
                if (tokenType) this._addItemForNameNode(node, tokenType, modifiers);
                return;
            }
            case DeclarationType.Param: {
                const type = this._getType(node);
                const tokenType = this._getParamSemanticToken(primaryDecl.node, type);
                this._addItemForNameNode(node, tokenType, []);
                return;
            }
            case DeclarationType.TypeParam: {
                this._addItemForNameNode(node, SemanticTokenTypes.typeParameter, []);
                return;
            }
            case DeclarationType.TypeAlias: {
                this._addItemForNameNode(node, SemanticTokenTypes.type, []);
                return;
            }
            case DeclarationType.Function: {
                const type = this._getType(node);
                const modifiers: TokenModifiers[] = [];
                const tokenType = this._getFunctionTokenType(
                    node,
                    primaryDecl,
                    type?.category === TypeCategory.Function ? type : undefined,
                    modifiers
                );
                this._addItemForNameNode(node, tokenType, modifiers);
                return;
            }
            case DeclarationType.Class:
            case DeclarationType.SpecialBuiltInClass: {
                const type = this._getType(node);
                const modifiers: TokenModifiers[] = [];
                let tokenType: TokenTypes = SemanticTokenTypes.type;
                if (type?.category === TypeCategory.Class) {
                    tokenType = this._getClassTokenType(type, declarations, modifiers) ?? tokenType;
                }
                this._addItemForNameNode(node, tokenType, modifiers);
                return;
            }
            default: {
                break;
            }
        }

        // Use the type-based case distinction as the fallback
        const type = this._getType(node);
        if (type) this._visitNameWithType(node, type, declarations);
    }

    private _visitNameWithType(node: NameNode, type: Type, declarations: Declaration[]) {
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
                    const modifiers: TokenModifiers[] = [];
                    const tokenType = this._getClassTokenType(type, declarations, modifiers);
                    this._addItemForNameNode(node, tokenType, modifiers);
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

        const modifiers: TokenModifiers[] = [];
        const tokenType = this._getVariableTokenType(node, type, declarations, modifiers);
        if (tokenType) this._addItemForNameNode(node, tokenType, modifiers);
    }

    private _getNameNodeDeclarations(node: NameNode): Declaration[] {
        const nameDecls = this._evaluator.getDeclInfoForNameNode(node)?.decls?.map((decl) => {
            if (decl.type === DeclarationType.Alias) {
                return this._evaluator.resolveAliasDeclaration(decl, true) ?? decl;
            }
            return decl;
        });
        return nameDecls ?? [];
    }

    private _getType(node: ExpressionNode): Type | undefined {
        let type = this._evaluator.getType(node);
        if (type) return type;
        // In the case of “from a import b as c”, “b” sometimes ends up without type,
        // e.g. in “from os import path as something”, but the alias (“c”) ends up with
        // the real type, which is used instead
        const parent = node.parent;
        if (parent?.nodeType === ParseNodeType.ImportFromAs && parent.d.alias) {
            type = this._evaluator.getType(parent.d.alias);
        }
        return type;
    }

    // “checkBuiltIn” can be set to “false” to disable checking whether the class is built-in
    private _getClassTokenType(
        classType: ClassType,
        declarations: Declaration[],
        modifiers: TokenModifiers[],
        checkBuiltIn: boolean = true
    ): SemanticTokenTypes {
        if (checkBuiltIn) {
            // Exclude type aliases:
            // PEP 613 > Name: TypeAlias = Types
            // PEP 695 > type Name = Types
            const isPEP613TypeAlias = declarations.some((declaration) =>
                this._evaluator.isExplicitTypeAliasDeclaration(declaration)
            );
            const isTypeAlias = isPEP613TypeAlias || classType.props?.typeAliasInfo?.shared.isTypeAliasType;

            const isBuiltIn =
                (!isTypeAlias &&
                    this.builtinModules.has(classType.shared.moduleName) &&
                    classType.priv.aliasName === undefined) ||
                (classType.props?.typeAliasInfo?.shared.moduleName &&
                    this.builtinModules.has(classType.props.typeAliasInfo.shared.moduleName));

            if (isBuiltIn) modifiers.push(SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin);
        }

        return ClassType.isEnumClass(classType) ? SemanticTokenTypes.enum : SemanticTokenTypes.class;
    }

    private _getVariableTokenType(
        node: NameNode,
        type: Type,
        declarations: Declaration[],
        modifiers: TokenModifiers[]
    ): TokenTypes | undefined {
        // Do not highlight variables whose type is unknown or whose type is Any and which have no declarations
        if (isUnknown(type) || (isAny(type) && declarations.length === 0)) return;

        if (
            node.nodeType === ParseNodeType.Name &&
            declarations.some((declaration) => declaration.moduleName.split('.').pop() === '__builtins__')
        ) {
            modifiers.push(CustomSemanticTokenModifiers.builtin);
        }

        // Mark as enumMember if any declaration is in enum class
        const isEnumMember = declarations.some(
            (decl) => isVariableDeclaration(decl) && isDeclInEnumClass(this._evaluator, decl)
        );
        if (isEnumMember) {
            return SemanticTokenTypes.enumMember;
        }

        // Track whether “readonly” has already been added to “modifiers”
        let readOnly = false;
        // Mark as “readonly” if the name implies a constant or one of the declarations is final
        if (isConstantName(node.d.value) || declarations.some((decl) => this._isFinal(decl))) {
            readOnly = true;
            modifiers.push(SemanticTokenModifiers.readonly);
        }

        // Detect type aliases
        if (type.props?.typeAliasInfo) {
            return SemanticTokenTypes.type;
        }
        // Handle variables that have been assigned a “TypeVar”
        if (isTypeVar(type)) {
            return SemanticTokenTypes.typeParameter;
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
        const baseType = this._getType(node.d.leftExpr);
        if (baseType && baseType.category === TypeCategory.Class) {
            // Skip the object base class because that always appears to contain these members
            return {
                get:
                    lookUpClassMember(baseType, '__getattribute__', MemberAccessFlags.SkipObjectBaseClass) ??
                    lookUpClassMember(baseType, '__getattr__', MemberAccessFlags.SkipObjectBaseClass),
                set: lookUpClassMember(baseType, '__setattr__', MemberAccessFlags.SkipObjectBaseClass),
            };
        }
        return undefined;
    }

    // Check whether “decl” is a final variable declaration (with alias resolution)
    private _isFinal(decl: Declaration): boolean {
        if (decl.type === DeclarationType.Variable) {
            return !!decl.isConstant || !!decl.isFinal || this._evaluator.isFinalVariableDeclaration(decl);
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
        const modifiers: TokenModifiers[] = [];
        const tokenType = this._getFunctionTokenType(node, type.shared.declaration, type, modifiers);
        this._addItemForNameNode(node, tokenType, modifiers);
    }

    private _getFunctionTokenType(
        node: NameNode,
        decl: Declaration | undefined,
        functionType: FunctionType | undefined,
        modifiers: TokenModifiers[]
    ): SemanticTokenTypes {
        if (functionType && this.builtinModules.has(functionType.shared.moduleName))
            modifiers.push(SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin);
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

        // Special handling for the right-hand side of a member accesses when there are no declarations
        if (!decl && node.parent?.nodeType === ParseNodeType.MemberAccess && node.parent.d.member === node) {
            // Check whether the member access uses “__getattr__” or “__getattribute__”
            // and the resulting type is a function type
            // For consistency with other callable attributes, these are highlighted like attributes
            const access = this._getMagicAttributeAccess(node.parent);
            if (access?.get) {
                if (!access.set) {
                    modifiers.push(SemanticTokenModifiers.readonly);
                }
                return SemanticTokenTypes.property;
            }

            // Check whether the left-hand side is a class instance, in which case the function
            // is highlighted as a method
            const lhsType = this._getType(node.parent.d.leftExpr);
            if (lhsType && isClassInstance(lhsType)) {
                return SemanticTokenTypes.method;
            }
        }

        return SemanticTokenTypes.function;
    }

    private _getParamSemanticToken(node: ParameterNode, type?: Type): TokenTypes {
        if (node.parent?.nodeType !== ParseNodeType.Function) {
            return SemanticTokenTypes.parameter;
        }
        if (node.parent.d.params[0].id !== node.id) {
            return SemanticTokenTypes.parameter;
        }

        const parentType = this._getType(node.parent.d.name);
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

    private _addItemForNameNode = (node: NameNode, type: TokenTypes, modifiers: TokenModifiers[]) =>
        this._addItem(node.d.token.start, node.d.token.length, type, modifiers);

    private _addItem(start: number, length: number, type: TokenTypes, modifiers: TokenModifiers[]) {
        this.items.push({ type, modifiers, start, length });
    }
}
