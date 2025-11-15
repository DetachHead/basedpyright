/*
 * parserNodeUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 *
 * ParseNodeType is a const enum which strips out the string keys
 * This file is used to map the string keys to the const enum values.
 */
import { TextRange } from '../common/textRange';
import { ArgumentNode, ParseNode, ParseNodeType } from './parseNodes';
import { OperatorType } from './tokenizerTypes';

type ParseNodeEnumStringKeys = Exclude<keyof typeof ParseNodeType, `${number}`>;
type ParseNodeTypeMapType = Record<ParseNodeEnumStringKeys, ParseNodeType>;

export const ParseNodeTypeMap: ParseNodeTypeMapType = {
    Error: ParseNodeType.Error,
    Argument: ParseNodeType.Argument,
    Assert: ParseNodeType.Assert,
    Assignment: ParseNodeType.Assignment,
    AssignmentExpression: ParseNodeType.AssignmentExpression,
    AugmentedAssignment: ParseNodeType.AugmentedAssignment,
    Await: ParseNodeType.Await,
    BinaryOperation: ParseNodeType.BinaryOperation,
    Break: ParseNodeType.Break,
    Call: ParseNodeType.Call,
    Class: ParseNodeType.Class,
    Comprehension: ParseNodeType.Comprehension,
    ComprehensionFor: ParseNodeType.ComprehensionFor,
    ComprehensionIf: ParseNodeType.ComprehensionIf,
    Constant: ParseNodeType.Constant,
    Continue: ParseNodeType.Continue,
    Decorator: ParseNodeType.Decorator,
    Del: ParseNodeType.Del,
    Dictionary: ParseNodeType.Dictionary,
    DictionaryExpandEntry: ParseNodeType.DictionaryExpandEntry,
    DictionaryKeyEntry: ParseNodeType.DictionaryKeyEntry,
    Ellipsis: ParseNodeType.Ellipsis,
    If: ParseNodeType.If,
    Import: ParseNodeType.Import,
    ImportAs: ParseNodeType.ImportAs,
    ImportFrom: ParseNodeType.ImportFrom,
    ImportFromAs: ParseNodeType.ImportFromAs,
    Index: ParseNodeType.Index,
    Except: ParseNodeType.Except,
    For: ParseNodeType.For,
    FormatString: ParseNodeType.FormatString,
    Function: ParseNodeType.Function,
    Global: ParseNodeType.Global,
    Lambda: ParseNodeType.Lambda,
    List: ParseNodeType.List,
    MemberAccess: ParseNodeType.MemberAccess,
    Module: ParseNodeType.Module,
    ModuleName: ParseNodeType.ModuleName,
    Name: ParseNodeType.Name,
    Nonlocal: ParseNodeType.Nonlocal,
    Number: ParseNodeType.Number,
    Parameter: ParseNodeType.Parameter,
    Pass: ParseNodeType.Pass,
    Raise: ParseNodeType.Raise,
    Return: ParseNodeType.Return,
    Set: ParseNodeType.Set,
    Slice: ParseNodeType.Slice,
    StatementList: ParseNodeType.StatementList,
    StringList: ParseNodeType.StringList,
    String: ParseNodeType.String,
    Suite: ParseNodeType.Suite,
    Ternary: ParseNodeType.Ternary,
    Tuple: ParseNodeType.Tuple,
    Try: ParseNodeType.Try,
    TypeAnnotation: ParseNodeType.TypeAnnotation,
    UnaryOperation: ParseNodeType.UnaryOperation,
    Unpack: ParseNodeType.Unpack,
    While: ParseNodeType.While,
    With: ParseNodeType.With,
    WithItem: ParseNodeType.WithItem,
    Yield: ParseNodeType.Yield,
    YieldFrom: ParseNodeType.YieldFrom,
    FunctionAnnotation: ParseNodeType.FunctionAnnotation,
    Match: ParseNodeType.Match,
    Case: ParseNodeType.Case,
    PatternSequence: ParseNodeType.PatternSequence,
    PatternAs: ParseNodeType.PatternAs,
    PatternLiteral: ParseNodeType.PatternLiteral,
    PatternClass: ParseNodeType.PatternClass,
    PatternCapture: ParseNodeType.PatternCapture,
    PatternMapping: ParseNodeType.PatternMapping,
    PatternMappingKeyEntry: ParseNodeType.PatternMappingKeyEntry,
    PatternMappingExpandEntry: ParseNodeType.PatternMappingExpandEntry,
    PatternValue: ParseNodeType.PatternValue,
    PatternClassArgument: ParseNodeType.PatternClassArgument,
    TypeParameter: ParseNodeType.TypeParameter,
    TypeParameterList: ParseNodeType.TypeParameterList,
    TypeAlias: ParseNodeType.TypeAlias,
};

export type ParseNodeTypeMapKey = keyof typeof ParseNodeTypeMap;

export const ParseNodeTypeNameMap: Record<ParseNodeType, ParseNodeEnumStringKeys> = Object.entries(
    ParseNodeTypeMap
).reduce((acc, [name, value]) => {
    acc[value] = name as ParseNodeEnumStringKeys;
    return acc;
}, {} as Record<ParseNodeType, ParseNodeEnumStringKeys>);

type OperatorTypeMapType = Record<string, OperatorType>;

export const OperatorTypeMap: OperatorTypeMapType = {
    '+': OperatorType.Add,
    '+=': OperatorType.AddEqual,
    '=': OperatorType.Assign,
    '&': OperatorType.BitwiseAnd,
    '&=': OperatorType.BitwiseAndEqual,
    '~': OperatorType.BitwiseInvert,
    '|': OperatorType.BitwiseOr,
    '|=': OperatorType.BitwiseOrEqual,
    '^': OperatorType.BitwiseXor,
    '^=': OperatorType.BitwiseXorEqual,
    '/': OperatorType.Divide,
    '/=': OperatorType.DivideEqual,
    '==': OperatorType.Equals,
    '//': OperatorType.FloorDivide,
    '//=': OperatorType.FloorDivideEqual,
    '>': OperatorType.GreaterThan,
    '>=': OperatorType.GreaterThanOrEqual,
    '<<': OperatorType.LeftShift,
    '<<=': OperatorType.LeftShiftEqual,
    '<>': OperatorType.LessOrGreaterThan,
    '<': OperatorType.LessThan,
    '<=': OperatorType.LessThanOrEqual,
    '@': OperatorType.MatrixMultiply,
    '@=': OperatorType.MatrixMultiplyEqual,
    '%': OperatorType.Mod,
    '%=': OperatorType.ModEqual,
    '*': OperatorType.Multiply,
    '*=': OperatorType.MultiplyEqual,
    '!=': OperatorType.NotEquals,
    '**': OperatorType.Power,
    '**=': OperatorType.PowerEqual,
    '>>': OperatorType.RightShift,
    '>>=': OperatorType.RightShiftEqual,
    '-': OperatorType.Subtract,
    '-=': OperatorType.SubtractEqual,
    and: OperatorType.And,
    or: OperatorType.Or,
    'not ': OperatorType.Not,
    is: OperatorType.Is,
    'is not': OperatorType.IsNot,
    in: OperatorType.In,
    'not in': OperatorType.NotIn,
};

export const OperatorTypeNameMap: Record<OperatorType, ParseNodeEnumStringKeys> = Object.entries(
    OperatorTypeMap
).reduce((acc, [name, value]) => {
    acc[value] = name as ParseNodeEnumStringKeys;
    return acc;
}, {} as Record<OperatorType, ParseNodeEnumStringKeys>);

export type OperatorTypeMapKey = keyof typeof OperatorTypeMap;

/**
 * Determine the node that should be handled when hovering over/clicking `node` to simplify the case distinctions using it.
 * Currently, this means that uses of `__setitem__` and single-target `__delitem__` are resolved to the `IndexNode`.
 */
export function getInfoNode(node: ParseNode): ParseNode {
    if (node.nodeType === ParseNodeType.Assignment && node.d.leftExpr.nodeType === ParseNodeType.Index) {
        node = node.d.leftExpr;
    }
    if (
        node.nodeType === ParseNodeType.Del &&
        node.d.targets.length === 1 &&
        node.d.targets[0].nodeType === ParseNodeType.Index
    ) {
        node = node.d.targets[0];
    }
    return node;
}

/**
 * Determine the actual range of the node in question: While `start` and `length` are _generally_ reliable,
 * this is not really true for chained assignments, where each left-hand side gets its own node, all of which
 * have the same range. To distinguish between these, this function determines the range from the start
 * of the left-hand side which this node represents to the end of the right-hand side.
 *
 * This is useful for determining which of the `Assignment` nodes representing an assignment is the most _appropriate_
 * for a given offset; in `a = b = 10`, for instance, an offset pointing to the second `=` should handle
 * the assignment node with `b` as the left-hand side, not the one with `a` (which is what `findNodeByOffset` returns).
 */
export function nodeRange(node: ParseNode): TextRange {
    if (node.nodeType === ParseNodeType.Assignment) {
        const left = node.d.leftExpr;
        const right = node.d.rightExpr;
        return TextRange.create(left.start, TextRange.getEnd(right) - left.start);
    }
    return TextRange.create(node.start, node.length);
}

/**
 * If `node` is an `Assignment` node that represents a chained assignment, determines the most appropriate sub-assignment
 * (which are `node`’s parents in the parse tree) for `offset`, i.e. the sub-assignment with the smallest range
 * that still includes `offsets`.
 *
 * For example, in `a = b = c = 10` with `offset` pointing at the second `=`, this function starts at the assignment
 * to `a`, chooses to the assignment to `b` (which still includes `offset`), but does not choose the assignment to `c`
 * (which does not include `offset` anymore). Note that Python does indeed assign to the left-hand sides from left to right.
 *
 * This function **does not** check the children of `node` for an expanded chained assignment, which is unnecessary
 * e.g. if `node` was determined using `findNodeByOffset`.
 */
export function improveNodeByOffset(node: ParseNode, offset: number): ParseNode {
    while (
        node.nodeType === ParseNodeType.Assignment &&
        node.parent?.nodeType === ParseNodeType.Assignment &&
        TextRange.contains(nodeRange(node.parent), offset)
    ) {
        node = node.parent;
    }
    return node;
}

/**
 * If `node` is an `ArgumentNode` node or a literal node with an `ArgumentNode` parent, return that
 * `ArgumentNode`.
 */
export function getArgumentNode(node: ParseNode): ArgumentNode | undefined {
    switch (node.nodeType) {
        case ParseNodeType.Argument:
            return node;
        case ParseNodeType.Number:
        case ParseNodeType.String:
        case ParseNodeType.StringList:
            return node.parent ? getArgumentNode(node.parent) : undefined;
        default:
            break;
    }
    return undefined;
}
