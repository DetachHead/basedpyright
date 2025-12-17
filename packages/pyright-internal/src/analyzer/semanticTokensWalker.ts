import { ParseTreeWalker } from './parseTreeWalker';
import { TypeEvaluator } from './typeEvaluatorTypes';
import {
    ClassType,
    FunctionType,
    getTypeAliasInfo,
    isAny,
    isAnyOrUnknown,
    isClass,
    isFunction,
    isFunctionOrOverloaded,
    isInstantiableClass,
    isMethodType,
    isModule,
    isNever,
    isOverloaded,
    isTypeVar,
    NeverType,
    OverloadedType,
    PropertyMethodInfo,
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
import { CustomSemanticTokenModifiers, CustomSemanticTokenTypes } from '../languageService/semanticTokensProvider';
import { Declaration, DeclarationType, isFunctionDeclaration, isVariableDeclaration } from './declaration';
import { getScopeForNode } from './scopeUtils';
import { ScopeType } from './scope';
import { assertNever } from '../common/debug';
import { getDeclaration } from './analyzerNodeInfo';
import { isDeclInEnumClass } from './enums';
import { getEnclosingClass, isWriteAccess } from './parseTreeUtils';
import { ClassMember, MemberAccessFlags, allSubtypes, isProperty, lookUpClassMember } from './typeUtils';

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

interface ClassMemberAccess {
    readOnly: boolean;
    isClassMember?: boolean;
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
            ? this._getClassTokenType(node.d.name, classType, decls, modifiers, false)
            : SemanticTokenTypes.class;
        this._addItemForNameNode(node.d.name, tokenType, modifiers);
        return super.visitClass(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        const decls = this._getNameNodeDeclarations(node.d.name);
        const modifiers = [SemanticTokenModifiers.declaration];
        if (node.d.isAsync) {
            modifiers.push(SemanticTokenModifiers.async);
        }
        const decl = getDeclaration(node);
        const tokenType = this._getFunctionTokenType(node.d.name, decl, decls, undefined, modifiers);
        this._addItemForNameNode(node.d.name, tokenType, modifiers);
        // parameters & return type are covered by visitName
        return super.visitFunction(node);
    }

    override visitParameter(node: ParameterNode): boolean {
        if (node.d.name) {
            const decls = this._getNameNodeDeclarations(node.d.name);
            const type = this._getType(node.d.name);
            let tokenType: TokenTypes = SemanticTokenTypes.parameter;
            const modifiers: TokenModifiers[] = [SemanticTokenModifiers.declaration];
            if (type) tokenType = this._getParamTokenType(node, type, decls, modifiers);
            this._addItemForNameNode(node.d.name, tokenType, modifiers);
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
                const modifiers: TokenModifiers[] = [];
                const tokenType = type ? this._getVariableTokenType(node, type, declarations, modifiers) : undefined;
                // If there is no type information, use “variable” by default
                this._addItemForNameNode(node, tokenType ?? SemanticTokenTypes.variable, modifiers);
                return;
            }
            case DeclarationType.Param: {
                const type = this._getType(node);
                let tokenType: TokenTypes | undefined = SemanticTokenTypes.parameter;
                const modifiers: TokenModifiers[] = [];
                if (type) tokenType = this._getParamTokenType(primaryDecl.node, type, declarations, modifiers);
                this._addItemForNameNode(node, tokenType, modifiers);
                return;
            }
            case DeclarationType.TypeParam: {
                this._addItemForNameNode(node, SemanticTokenTypes.typeParameter, []);
                return;
            }
            case DeclarationType.TypeAlias: {
                // Use “class” if the type is a class and “type” otherwise (e.g. unions or “Literal”)
                const type = this._getType(node);
                this._addItemForNameNode(
                    node,
                    type && isClass(type) ? SemanticTokenTypes.class : SemanticTokenTypes.type,
                    []
                );
                return;
            }
            case DeclarationType.Function: {
                const type = this._getType(node);
                const functionType =
                    type?.category === TypeCategory.Function
                        ? type
                        : type?.category === TypeCategory.Overloaded
                        ? OverloadedType.getOverloads(type)[0]
                        : undefined;
                const modifiers: TokenModifiers[] = [];
                const tokenType = this._getFunctionTokenType(node, primaryDecl, declarations, functionType, modifiers);
                this._addItemForNameNode(node, tokenType, modifiers);
                return;
            }
            case DeclarationType.Class:
            case DeclarationType.SpecialBuiltInClass: {
                const type = this._getType(node);
                const modifiers: TokenModifiers[] = [];
                // If there is no type information, use “type” by default
                let tokenType: TokenTypes = SemanticTokenTypes.type;
                if (type?.category === TypeCategory.Class) {
                    tokenType = this._getClassTokenType(node, type, declarations, modifiers);
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
                    this._addItemForNameNode(node, SemanticTokenTypes.class, []);
                }
                return;
            // these are handled below
            case TypeCategory.Unknown:
                return;
            case TypeCategory.TypeVar:
                break;
            case TypeCategory.Never: {
                const neverToken = this._getNeverTokenType(node, type);
                if (neverToken) {
                    this._addItemForNameNode(node, neverToken, []);
                    return;
                }
                break;
            }
            case TypeCategory.Unbound:
                return;
            case TypeCategory.Function:
                this._visitFunctionWithType(node, type, declarations);
                return;
            case TypeCategory.Overloaded:
                this._visitFunctionWithType(node, OverloadedType.getOverloads(type)[0], declarations);
                return;
            case TypeCategory.Module:
                this._addItemForNameNode(node, SemanticTokenTypes.namespace, []);
                return;
            case TypeCategory.Union:
                if (!TypeBase.isInstance(type)) {
                    this._addItemForNameNode(node, SemanticTokenTypes.class, []);
                    return;
                }
                break;
            case TypeCategory.Class:
                // type annotations handled by visitTypeAnnotation
                if (!TypeBase.isInstance(type)) {
                    const modifiers: TokenModifiers[] = [];
                    const tokenType = this._getClassTokenType(node, type, declarations, modifiers);
                    this._addItemForNameNode(node, tokenType, modifiers);
                    return;
                }
                break;
            default:
                assertNever(type);
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
        // In the case of “from a import b as c”, “b” sometimes ends up without a type,
        // e.g. “path” in “from os import path as something”, but the alias (“c”) ends up with
        // the real type, which is used instead
        const parent = node.parent;
        if (parent?.nodeType === ParseNodeType.ImportFromAs && parent.d.alias) {
            type = this._evaluator.getType(parent.d.alias);
        }
        return type;
    }

    private _getClassMemberAccessInfo(node: NameNode, declarations: Declaration[]): ClassMemberAccess | undefined {
        // Mark as a class member if any declaration is within a class
        const enclosingClass = declarations
            .map((decl) => getEnclosingClass(decl.node, /*stopAtFunction*/ true))
            .find((node) => node);
        if (enclosingClass) {
            // If every declaration has a property type, but does not contain fset information, mark as “readonly”
            const readOnly = declarations.every((d) => this._missingPropertySetter(d));
            // If the enclosing class has a member of the given name, return that information
            const classType = this._getType(enclosingClass.d.name);
            const isClassMember = !!classType && !!isClass(classType) && !!lookUpClassMember(classType, node.d.value);
            return { readOnly, isClassMember };
        }

        // A symbol on the right-hand side of a member access whose left-hand side is a class
        // is interpreted as a class member
        const parent = node.parent;
        if (parent?.nodeType === ParseNodeType.MemberAccess && parent.d.member === node) {
            let leftType = this._getType(parent.d.leftExpr);
            // If the type of the left-hand side is a type variable, try to get the bound type
            if (leftType && isTypeVar(leftType) && leftType.shared.boundType) {
                leftType = leftType.shared.boundType;
            }
            if (leftType && isClass(leftType)) {
                let readOnly = false;
                let isClassMember = false;
                // This is quite a primitive heuristic for determining member accesses through magic methods,
                // but since it is only used to check for read-only access, it should be sufficient
                if (declarations.length === 0) {
                    // If there are no declarations, we check whether the access uses magic methods
                    // To determine whether the magic method access is read-only, check if there is
                    // a magic getter (__getattr__ or __getattribute__) but no magic setter (__setattr__)
                    const access = this._getMagicAttributeAccess(parent);
                    if (access && access.get && !access.set) {
                        readOnly = true;
                    }
                } else if (isInstantiableClass(leftType)) {
                    isClassMember = true;
                }
                return { readOnly, isClassMember };
            }
        }
        return undefined;
    }

    /**
     * @returns Whether class member access is taking place
     */
    private _applyClassMemberAccessModifiers(
        node: NameNode,
        declarations: Declaration[],
        modifiers: TokenModifiers[],
        alreadyReadOnly: boolean = false
    ): boolean {
        const memberInfo = this._getClassMemberAccessInfo(node, declarations);
        if (memberInfo) {
            if (!alreadyReadOnly && memberInfo.readOnly) modifiers.push(SemanticTokenModifiers.readonly);
            modifiers.push(CustomSemanticTokenModifiers.classMember);
            if (memberInfo.isClassMember) modifiers.push(SemanticTokenModifiers.static);
        }
        return !!memberInfo;
    }

    /**
     * @param checkBuiltIn can be set to `false` to disable checking whether the class is built-in
     */
    private _getClassTokenType(
        node: NameNode,
        classType: ClassType,
        declarations: Declaration[],
        modifiers: TokenModifiers[],
        checkBuiltIn: boolean = true,
        applyClassMemberAccess: boolean = true
    ): SemanticTokenTypes {
        // Mark as built-in if one of the declarations is in a built-in module
        if (checkBuiltIn && declarations.some((decl) => this.builtinModules.has(decl.moduleName)))
            modifiers.push(SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin);

        if (applyClassMemberAccess) this._applyClassMemberAccessModifiers(node, declarations, modifiers);
        return ClassType.isEnumClass(classType) ? SemanticTokenTypes.enum : SemanticTokenTypes.class;
    }

    /** This is used for both variables and parameters, as specified by `isParam`. */
    private _getVariableTokenType(
        node: NameNode | undefined,
        type: Type,
        declarations: Declaration[],
        modifiers: TokenModifiers[],
        isParam: boolean = false
    ): TokenTypes | undefined {
        // `node` is always defined for variables
        if (!node) return SemanticTokenTypes.parameter;

        // Do not highlight variables whose type is unknown or Any and not a “special form”
        // `specialForm` is `undefined` for instances of `Any` but not for the `Any` type itself,
        // preventing variables storing the type `Any` from being covered by this condition
        // (these are handled later).
        if (!type.props?.specialForm && isAnyOrUnknown(type)) return;

        if (!isParam) {
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
        }

        // Track whether “readonly” has already been added to “modifiers”
        let readOnly = false;

        // Mark as “readonly” if one of the declarations is final
        if (declarations.some((decl) => this._isFinal(decl))) {
            readOnly = true;
            modifiers.push(SemanticTokenModifiers.readonly);
        }

        // Store whether the variable is a class member, i.e. a class/instance variable
        const isClassMember =
            !isParam && this._applyClassMemberAccessModifiers(node, declarations, modifiers, readOnly);

        if (!isParam) {
            // Handle variables that have been assigned a `TypeVar` (not those whose type is a `TypeVar`)
            // There are weird cases in which bogus type variables are synthesized
            // Example: Left-hand side `x` of `self.x = x` in `parameters.py`
            if (isTypeVar(type) && !type.shared.isSynthesized && TypeBase.isInstantiable(type)) {
                return SemanticTokenTypes.typeParameter;
            }
        }

        // Detect variables that store a type form. note that `type`s (classes that can be instantiated) should get `class` token
        // and everything else (`TypeForm`s) should get the `type` token
        // and do not fall into a category that is handled elsewhere
        if (
            TypeBase.isInstantiable(type) &&
            ![
                TypeCategory.Unbound,
                TypeCategory.Unknown,
                TypeCategory.Any, // handled below
                TypeCategory.Never, // handled below
                TypeCategory.Module, // handled below
                TypeCategory.TypeVar, // handled in _visitNameWithDeclarations
            ].includes(type.category)
        ) {
            // Use “class” if the type is a class and “type” otherwise (e.g. unions or “Literal”)
            if (isClass(type)) return this._getClassTokenType(node, type, declarations, modifiers, true, false);
            return SemanticTokenTypes.type;
        }

        // Handle variables storing the type `Any`
        if (isAny(type) && type.props?.specialForm) {
            return SemanticTokenTypes.type;
        }

        // Detect variables that store a function or an overloaded function
        const primaryDecl = declarations.length > 0 ? declarations[0] : undefined;
        if (isFunction(type)) {
            return this._getFunctionTokenType(node, primaryDecl, declarations, type, modifiers);
        }
        if (isOverloaded(type)) {
            const functionType = OverloadedType.getOverloads(type)[0];
            return this._getFunctionTokenType(node, primaryDecl, declarations, functionType, modifiers);
        }

        // If all member types of a union are function/overloaded types, highlight as a function
        if (allSubtypes(type, isFunctionOrOverloaded)) {
            return SemanticTokenTypes.function;
        }

        // Detect module variables
        if (!isParam && isModule(type)) {
            return SemanticTokenTypes.namespace;
        }

        // Detect “Never”/“NoReturn” type aliases
        if (isNever(type)) {
            const tokenType = this._getNeverTokenType(node, type);
            if (tokenType) return tokenType;
        }

        // If a variable is a class member and not handled by any other case, use “property”
        if (isParam) {
            return SemanticTokenTypes.parameter;
        }
        return isClassMember ? SemanticTokenTypes.property : SemanticTokenTypes.variable;
    }

    /**
     * @returns information about the magic attribute methods which the left-hand side provides
     * for a given attribute access
     */
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

    /** @returns whether “decl” is a final variable declaration */
    private _isFinal(decl: Declaration): boolean {
        if (decl.type === DeclarationType.Variable) {
            return !!decl.isConstant || !!decl.isFinal || this._evaluator.isFinalVariableDeclaration(decl);
        }
        return false;
    }

    /** @returns whether “decl” has a property type and does not contain fset information */
    private _missingPropertySetter(decl: Declaration): boolean {
        const type = this._evaluator.getTypeForDeclaration(decl).type;
        return !!type && isClass(type) && ClassType.isPropertyClass(type) && !type.priv.fsetInfo;
    }

    /** @returns `fget`/`fset` information (depending on `isWriteAccess`) if `decl` is a property declaration */
    private _getPropertyInfo(decl: Declaration, isWriteAccess: boolean): PropertyMethodInfo | undefined {
        const type = this._evaluator.getTypeForDeclaration(decl).type;
        if (type && isClass(type) && ClassType.isPropertyClass(type)) {
            return isWriteAccess ? type.priv.fsetInfo : type.priv.fgetInfo;
        }
        return undefined;
    }

    private _visitFunctionWithType(node: NameNode, type: FunctionType, declarations: Declaration[]) {
        const modifiers: TokenModifiers[] = [];
        const tokenType = this._getFunctionTokenType(node, type.shared.declaration, declarations, type, modifiers);
        this._addItemForNameNode(node, tokenType, modifiers);
    }

    private _getFunctionTokenType(
        node: NameNode,
        decl: Declaration | undefined,
        declarations: Declaration[],
        functionType: FunctionType | undefined,
        modifiers: TokenModifiers[]
    ): TokenTypes {
        // type alias to Callable
        if (functionType && !TypeBase.isInstance(functionType)) {
            return SemanticTokenTypes.class;
        }

        if (functionType && this.builtinModules.has(functionType.shared.moduleName))
            modifiers.push(SemanticTokenModifiers.defaultLibrary, CustomSemanticTokenModifiers.builtin);
        if (decl && isFunctionDeclaration(decl)) {
            if (!functionType) functionType = this._evaluator.getTypeOfFunction(decl.node)?.functionType;
            if (functionType && FunctionType.isStaticMethod(functionType))
                modifiers.push(SemanticTokenModifiers.static);

            if (decl.isMethod) {
                // A method is, by definition, a class member
                modifiers.push(CustomSemanticTokenModifiers.classMember);

                const declaredType = this._evaluator.getTypeForDeclaration(decl)?.type;

                // if there is no type information, use the default `method` token type
                if (!declaredType) {
                    return SemanticTokenTypes.method;
                }

                const isProp = isProperty(declaredType);

                // determine whether `node` is part of an assignment, in which case the type
                // of the last parameter of the setter is used instead of the return type of the getter
                const isWrite = isWriteAccess(node);
                let methodType: Type | undefined;
                let isReadOnly: boolean;
                if (isProp) {
                    // since `__get__`/`__set__` cannot be found for properties, try to find the first
                    // `fget`/`fset` information and use its method type if it exists
                    methodType = declarations
                        .map((decl) => this._getPropertyInfo(decl, isWrite))
                        .find((i) => i)?.methodType;
                    // check the declarations for `fset` information
                    isReadOnly = declarations.every((d) => this._missingPropertySetter(d));
                } else {
                    // a descriptor type has to be a class type
                    if (!isClass(declaredType)) {
                        return SemanticTokenTypes.method;
                    }

                    // get the type of `__get__`/`__set__` of the descriptor instance
                    const set = this._evaluator.getTypeOfBoundMember(node, declaredType, '__set__', { method: 'set' });
                    const member = isWrite
                        ? set
                        : this._evaluator.getTypeOfBoundMember(node, declaredType, '__get__', { method: 'get' });
                    // if this is not a property and does not provide the required descriptor methods,
                    // use the default `method` token type
                    if (!member) {
                        return SemanticTokenTypes.method;
                    }

                    methodType = member?.type;
                    // a descriptor instance is read-only if `__set__` is not present
                    isReadOnly = !set;
                }
                if (isReadOnly) {
                    modifiers.push(SemanticTokenModifiers.readonly);
                }

                let effectiveType: Type | undefined = undefined;
                if (isWrite) {
                    // for the setter, get the last argument, which is the new value, and use its type
                    if (methodType && isFunction(methodType) && methodType.shared.parameters.length >= 2) {
                        // For some reason, there is a dummy `Any` parameter between `self` and the value in some cases
                        // However, the value parameter _appears_ to always be the last parameter
                        effectiveType = FunctionType.getParamType(methodType, methodType.shared.parameters.length - 1);
                    }
                } else {
                    // for the getter, use the return type
                    if (methodType && isFunction(methodType))
                        effectiveType = FunctionType.getEffectiveReturnType(methodType);
                }

                // If there is no type information, use `property`
                if (!effectiveType) {
                    return SemanticTokenTypes.property;
                }

                if (isFunctionOrOverloaded(effectiveType)) {
                    const isMethod = isMethodType(effectiveType);
                    return isMethod ? SemanticTokenTypes.method : SemanticTokenTypes.function;
                }
                // If `effectiveType` is a function/overloaded type or a union thereof,
                // highlight as a function/method
                if (allSubtypes(effectiveType, isFunctionOrOverloaded)) {
                    const isMethod = allSubtypes(effectiveType, (t) =>
                        isMethodType(t as FunctionType | OverloadedType)
                    );
                    return isMethod ? SemanticTokenTypes.method : SemanticTokenTypes.function;
                }

                // If `effectiveType` is `Any` or unknown and the type is not a “special form”,
                // which applies to `Any` itself, use `property`
                if (isAnyOrUnknown(effectiveType) && !effectiveType.props?.specialForm) {
                    return SemanticTokenTypes.property;
                }

                if (TypeBase.isInstantiable(effectiveType)) {
                    // Resolve type variables to their bound types
                    if (isTypeVar(effectiveType)) effectiveType = effectiveType.shared.boundType ?? effectiveType;
                    return isClass(effectiveType) ? SemanticTokenTypes.class : SemanticTokenTypes.type;
                }
                return SemanticTokenTypes.property;
            }
        }

        // Special handling for the right-hand side of a member accesses when there are no declarations
        if (!decl && node.parent?.nodeType === ParseNodeType.MemberAccess && node.parent.d.member === node) {
            // Check if the left-hand side is a class and add `classMember` if so
            if (this._getType(node.parent.d.leftExpr)?.category === TypeCategory.Class) {
                modifiers.push(CustomSemanticTokenModifiers.classMember);
            }

            // Check whether the member access uses “__getattr__” or “__getattribute__”
            // and the resulting type is a function type
            const access = this._getMagicAttributeAccess(node.parent);
            if (access?.get) {
                if (!access.set) {
                    modifiers.push(SemanticTokenModifiers.readonly);
                }
                // Return the token type `function` or `method`
                return functionType && functionType.shared.methodClass
                    ? SemanticTokenTypes.method
                    : SemanticTokenTypes.function;
            }

            // Check whether the left-hand side is a class instance, in which case the function is highlighted as a method
            // This is relevant in cases in which there are no declarations for synthesized functions, e.g. `setter`
            // in `@x.setter` for some property `x`, which would otherwise be highlighted as `function` through the base case
            const lhsType = this._getType(node.parent.d.leftExpr);
            if (lhsType && isClass(lhsType)) {
                return SemanticTokenTypes.method;
            }
        }

        return SemanticTokenTypes.function;
    }

    private _getParamTokenType(
        node: ParameterNode,
        type: Type,
        declarations: Declaration[],
        modifiers: TokenModifiers[]
    ): TokenTypes {
        modifiers.push(CustomSemanticTokenModifiers.parameter);

        if (node.parent?.nodeType !== ParseNodeType.Function || node.parent.d.params[0].id !== node.id) {
            return (
                this._getVariableTokenType(node.d.name, type, declarations, modifiers, true) ??
                SemanticTokenTypes.parameter
            );
        }

        const parentType = this._getType(node.parent.d.name);
        const isMethodParam =
            parentType?.category === TypeCategory.Function &&
            (FunctionType.isClassMethod(parentType) ||
                FunctionType.isInstanceMethod(parentType) ||
                FunctionType.isConstructorMethod(parentType));

        if (!(isMethodParam && getScopeForNode(node)?.type === ScopeType.Class)) {
            return (
                this._getVariableTokenType(node.d.name, type, declarations, modifiers, true) ??
                SemanticTokenTypes.parameter
            );
        }

        return type && TypeBase.isInstantiable(type)
            ? CustomSemanticTokenTypes.clsParameter
            : CustomSemanticTokenTypes.selfParameter;
    }

    private _getNeverTokenType(node: NameNode, type: NeverType): TokenTypes | undefined {
        const symbol = this._evaluator.lookUpSymbolRecursive(node, node.d.value, false)?.symbol;
        if (symbol) {
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
                return SemanticTokenTypes.type;
            }
        }
        return undefined;
    }

    private _addItemForNameNode = (node: NameNode, type: TokenTypes, modifiers: TokenModifiers[]) =>
        this._addItem(node.d.token.start, node.d.token.length, type, modifiers);

    private _addItem(start: number, length: number, type: TokenTypes, modifiers: TokenModifiers[]) {
        this.items.push({ type, modifiers, start, length });
    }
}
