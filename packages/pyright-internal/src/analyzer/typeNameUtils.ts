import { ParseNode, ParseNodeType } from '../parser/parseNodes';
import { Scope } from './scope';
import { SymbolTable } from './symbol';
import { TypeEvaluator } from './typeEvaluatorTypes';
import { ClassType, isClass, isModule, ModuleType, TypeBase } from './types';

function handleSymbolTable(evaluator: TypeEvaluator, type: ClassType | ModuleType, symbolTable: SymbolTable): string[] {
    const getFullName = (t: ClassType | ModuleType) => (isClass(t) ? t.shared.fullName : t.priv.moduleName);
    const fullName = getFullName(type);

    // The symbols in symbolTable whose type is a non-instance class or a module
    const symbols: { type: ClassType | ModuleType; localName: string; fullName: string }[] = [];
    symbolTable.forEach((symbol, symbolName) => {
        const symbolType = evaluator.getEffectiveTypeOfSymbol(symbol);
        if ((isClass(symbolType) && !TypeBase.isInstance(symbolType)) || isModule(symbolType)) {
            symbols.push({ type: symbolType, localName: symbolName, fullName: getFullName(symbolType) });
        }
    });

    // If there are symbols whose type has the same full name as `type`, return these
    const exactMatches = symbols.filter((symbolInfo) => symbolInfo.fullName === fullName);
    if (exactMatches.length > 0) return exactMatches.map((symbolInfo) => symbolInfo.localName);

    // If there are no full matches, try to find types whose name is a prefix to `type`’s full name
    // and then recursively try to find a symbol with `type`’s full type.
    return symbols
        .filter((symbolInfo) => fullName.startsWith(symbolInfo.fullName))
        .flatMap((symbolInfo) =>
            handleSymbolTable(
                evaluator,
                type,
                isClass(symbolInfo.type) ? ClassType.getSymbolTable(symbolInfo.type) : symbolInfo.type.priv.fields
            ).map((name) => `${symbolInfo.localName}.${name}`)
        );
}

/**
 * Determine the names (potentially including `.`) which can be used to reference `type` within `scope`.
 *
 * This function goes through the symbols defined within `scope` and its parent to find classes/modules
 * whose full name is a prefix of `type`’s full name. For each of these, it recursively searches the symbols
 * defined in that class/module for other classes/modules whose full name is a prefix of `type`’s full name
 * until a type with `type`’s full name is found.
 *
 * For example, consider the following definition:
 * ```python
 * class A:
 *     class B: pass
 * ```
 * After this, the type representing `A.B` has the local names `['A.B']`. However, if that definition is
 * in a different module called `lib`, we have a few different cases for the local names of `A.B`
 * depending on how `lib`/its members have been imported:
 * - `import lib`: The local names are `['lib.A.B']`.
 * - `import lib as mod`: The local names are `['mod.A.B']`.
 * - `import lib as mod; from lib import A`: The local names are `['mod.A.B', 'A.B']`.
 * - `import lib as mod; from lib import A as C`: The local names are `['mod.A.B', 'C.B']`.
 */
export function getLocalTypeNames(evaluator: TypeEvaluator, type: ClassType | ModuleType, scope: Scope): string[] {
    const out: string[] = [];
    let currentScope: Scope | undefined = scope;
    while (currentScope) {
        out.push(...handleSymbolTable(evaluator, type, currentScope.symbolTable));
        currentScope = currentScope.parent;
    }
    return out;
}

/**
 * Determine the parts names of `type` and its enclosing classes from least to most nested class.
 *
 * For example, if class `C` is defined in class `B`, which in turn is defined in class `A`,
 * this function returns `['A', 'B', 'C']`.
 *
 * If there is anything but classes between `type` and the module it is defined in, e.g. if `type`
 * is defined within a function, this function returns `undefined`.
 */
export function getNestedClassNameParts(type: ClassType): string[] | undefined {
    const parts: string[] = [];
    let enclosingNode: ParseNode | undefined = type.shared.declaration ? type.shared.declaration?.node : undefined;
    while (enclosingNode?.nodeType === ParseNodeType.Class || enclosingNode?.nodeType === ParseNodeType.Suite) {
        if (enclosingNode.nodeType === ParseNodeType.Class) parts.push(enclosingNode.d.name.d.value);
        enclosingNode = enclosingNode.parent;
    }
    if (enclosingNode?.nodeType !== ParseNodeType.Module) {
        return undefined;
    }
    return parts.reverse();
}
