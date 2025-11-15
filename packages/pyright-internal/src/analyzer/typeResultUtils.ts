import {
    AugmentedAssignmentNode,
    BinaryOperationNode,
    IndexNode,
    ParseNodeType,
    UnaryOperationNode,
} from '../parser/parseNodes';
import { Declaration } from './declaration';
import {
    getTypeOfAugmentedAssignment,
    getTypeOfBinaryOperation,
    getTypeOfIndex,
    getTypeOfUnaryOperation,
} from './operations';
import { EvalFlags, TypeEvaluator, TypeResult } from './typeEvaluatorTypes';

/**
 * Iterate over the declarations within `typeResult`, where `isTypedDictItem` represents whether
 * the `declaration` is the item declaration of a `TypedDict` item. If `typeResult` represents a
 * `TypedDict` item, `isArgument` determines whether the `TypedDict` item declaration or the
 * declaration of the corresponding `dict` magic methods is used for the callbacks.
 *
 * These declarations include information about `TypedDict` items or, if that is not available,
 * the declarations of the overloads used to determine the `TypeResult`.
 *
 * @returns An object where `isTypedDictItem` denotes whether `typeResult` represents a `TypedDict`
 *          item.
 */
export function forEachDeclaration(
    typeResult: TypeResult,
    callback: (declaration: Declaration, isTypedDictItem: boolean) => void,
    isArgument: boolean
): { isTypedDictItem: boolean } {
    if (typeResult.typedDictItemInfos && typeResult.typedDictItemInfos.length > 0) {
        // Use the `TypedDict` item information when available.
        if (isArgument) {
            // Use the declarations of the `TypedDict` items.
            typeResult.typedDictItemInfos.forEach((member) => {
                if (member.declaration) callback(member.declaration, true);
            });
        } else {
            // Use the declarations of the de-duplicated `dict` magic methods.
            const declarations = typeResult.typedDictItemInfos.map((member) => member.magicMethod.shared.declaration);
            declarations.forEach((decl, i) => {
                if (decl && declarations.indexOf(decl) === i) callback(decl, false);
            });
        }
        return { isTypedDictItem: true };
    } else {
        const declarations = typeResult.overloadsUsedForCall
            ?.map((type) => type.shared.declaration)
            .filter((decl) => decl !== undefined);
        declarations?.forEach((decl) => callback(decl, false));
        return { isTypedDictItem: false };
    }
}

/** Determine a `TypeResult` for a `node` that may call an (overloaded) operator. */
export function getTypeOfOperatorNode(
    evaluator: TypeEvaluator,
    node: UnaryOperationNode | BinaryOperationNode | AugmentedAssignmentNode | IndexNode
): TypeResult {
    switch (node.nodeType) {
        case ParseNodeType.UnaryOperation: {
            return getTypeOfUnaryOperation(evaluator, node, EvalFlags.None, undefined);
        }
        case ParseNodeType.BinaryOperation: {
            return getTypeOfBinaryOperation(evaluator, node, EvalFlags.None, undefined);
        }
        case ParseNodeType.AugmentedAssignment: {
            return getTypeOfAugmentedAssignment(evaluator, node, undefined);
        }
        case ParseNodeType.Index: {
            return getTypeOfIndex(evaluator, node);
        }
    }
}
