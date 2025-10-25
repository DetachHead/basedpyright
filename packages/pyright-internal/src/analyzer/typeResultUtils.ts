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
 * Iterate over the declarations within `typeResult`, where `unfiltered` represents the declaration
 * should always be kept even when declarations are filtered, which applies to the item declaration
 * of a `TypedDict` item.
 *
 * These declarations include information about `TypedDict` items or, if that is not available,
 * the declarations of the overloads used to determine the `TypeResult`.
 */
export function forEachDeclaration(
    typeResult: TypeResult,
    callback: (declarations: Declaration[], unfiltered: boolean) => void
): void {
    if (typeResult.typedDictItemInfos && typeResult.typedDictItemInfos.length > 0) {
        typeResult.typedDictItemInfos.forEach((member) => {
            if (member.declaration) {
                callback([member.declaration], true);
            }
            if (member.magicMethod.shared.declaration) {
                callback([member.magicMethod.shared.declaration], false);
            }
        });
    } else {
        const declarations = typeResult.overloadsUsedForCall
            ?.map((type) => type.shared.declaration)
            .filter((decl) => decl !== undefined);
        if (declarations && declarations.length > 0) {
            callback(declarations, false);
        }
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
