import { Range } from 'vscode-languageserver-types';
import { ParseTreeWalker } from '../analyzer/parseTreeWalker';
import { isDunderName, isUnderscoreOnlyName } from '../analyzer/symbolNameUtils';
import { FunctionType, Type, getTypeAliasInfo, isAny, isClass, isParamSpec, isTypeVar } from '../analyzer/types';
import { ProgramView } from '../common/extensibility';
import { limitOverloadBasedOnCall } from '../languageService/tooltipUtils';
import {
    CallNode,
    FunctionNode,
    NameNode,
    ParameterCategory,
    ParseNode,
    ParseNodeBase,
    ParseNodeType,
} from '../parser/parseNodes';
import { isLiteralType } from './typeUtils';
import { TextRange } from '../common/textRange';
import { convertRangeToTextRange } from '../common/positionUtils';
import { TextRangeCollection } from '../common/textRangeCollection';
import { Uri } from '../common/uri/uri';
import { ParseFileResults } from '../parser/parser';

export type TypeInlayHintsItemType = {
    inlayHintType: 'variable' | 'functionReturn' | 'parameter';
    position: number;
    value: string;
};
// Don't generate inlay hints for arguments to builtin types and functions
const ignoredBuiltinTypes = new Set(
    [
        'builtins.bool',
        'builtins.bytes',
        'builtins.bytearray',
        'builtins.float',
        'builtins.int',
        'builtins.list',
        'builtins.memoryview',
        'builtins.str',
        'builtins.tuple',
        'builtins.range',
        'builtins.enumerate',
        'builtins.map',
        'builtins.filter',
        'builtins.slice',
        'builtins.type',
        'builtins.reversed',
        'builtins.zip',
    ].flatMap((v) => [`${v}.__new__`, `${v}.__init__`])
);
const ignoredBuiltinFunctions = new Set([
    'builtins.len',
    'builtins.max',
    'builtins.min',
    'builtins.next',
    'builtins.repr',
    'builtins.setattr',
    'builtins.getattr',
    'builtins.hasattr',
    'builtins.sorted',
    'builtins.isinstance',
    'builtins.id',
    'builtins.iter',
]);

function isIgnoredBuiltin(type: FunctionType): boolean {
    if (type.details.moduleName !== 'builtins') {
        return false;
    }
    const funcName = type.details.name;
    if (funcName === '__new__' || funcName === '__init__') {
        return ignoredBuiltinTypes.has(type.details.fullName);
    }
    return ignoredBuiltinFunctions.has(type.details.fullName);
}

function isLeftSideOfAssignment(node: ParseNode): boolean {
    if (node.parent?.nodeType !== ParseNodeType.Assignment) {
        return false;
    }
    return node.start < node.parent.rightExpression.start;
}

export class TypeInlayHintsWalker extends ParseTreeWalker {
    featureItems: TypeInlayHintsItemType[] = [];
    parseResults: ParseFileResults | undefined;
    lines: TextRangeCollection<TextRange>;
    private _range: TextRange | undefined;

    constructor(private readonly _program: ProgramView, fileUri: Uri, range?: Range) {
        super();
        this.parseResults = this._program.getParseResults(fileUri);
        this.lines = this.parseResults!.tokenizerOutput.lines;
        if (range) {
            this._range = convertRangeToTextRange(range, this.lines);
        }
    }

    override visitName(node: NameNode): boolean {
        if (
            this._checkInRange(node) &&
            isLeftSideOfAssignment(node) &&
            !isDunderName(node.value) &&
            !isUnderscoreOnlyName(node.value)
        ) {
            const type = this._program.evaluator?.getType(node);
            if (
                type &&
                !isAny(type) &&
                !(isClass(type) && isLiteralType(type)) &&
                !isTypeVar(type) &&
                !isParamSpec(type)
            ) {
                this.featureItems.push({
                    inlayHintType: 'variable',
                    position: node.start + node.length,
                    value: `: ${
                        type.typeAliasInfo &&
                        node.nodeType === ParseNodeType.Name &&
                        // prevent variables whose type comes from a type alias from being incorrectly treated as a TypeAlias.
                        getTypeAliasInfo(type)?.name === node.value
                            ? 'TypeAlias'
                            : this._printType(type)
                    }`,
                });
            }
        }
        return super.visitName(node);
    }

    override visitCall(node: CallNode): boolean {
        if (this._checkInRange(node)) {
            this._generateHintsForCallNode(node);
        }
        return super.visitCall(node);
    }

    override visitFunction(node: FunctionNode): boolean {
        if (this._checkInRange(node)) {
            const evaluator = this._program.evaluator;
            const functionType = evaluator?.getTypeOfFunction(node)?.functionType;
            if (functionType !== undefined && !functionType.details.declaredReturnType) {
                const inferredReturnType = evaluator?.getFunctionInferredReturnType(functionType);
                if (inferredReturnType) {
                    this.featureItems.push({
                        inlayHintType: 'functionReturn',
                        position: node.suite.start,
                        value: `-> ${this._printType(inferredReturnType)}`,
                    });
                }
            }
        }

        return super.visitFunction(node);
    }

    private _checkInRange = (node: ParseNodeBase) =>
        !this._range || TextRange.overlapsRange(this._range, TextRange.create(node.start, node.length));

    private _generateHintsForCallNode(node: CallNode) {
        const evaluator = this._program.evaluator;
        if (!evaluator) {
            return;
        }
        const functionType = evaluator.getType(node.leftExpression);
        if (!functionType) {
            return;
        }
        // if it's an overload, figure out which one to use based on the arguments:
        const matchedFunctionType = limitOverloadBasedOnCall(evaluator, functionType, node.leftExpression);
        const matchedArgs = this._program.evaluator?.matchCallArgsToParams(node, matchedFunctionType);

        // if there was no match, or if there were multiple matches, we don't want to show any inlay hints because they'd likely be wrong:
        if (matchedArgs?.length !== 1) {
            return;
        }
        const result = matchedArgs[0];

        if (result.match.argumentErrors) {
            return;
        }
        if (isIgnoredBuiltin(result.type)) {
            return;
        }

        for (const p of result.match.argParams) {
            // If the argument is specified as a keyword argument, there is no need to generate a hint
            if (p.argument.name) {
                continue;
            }
            const argNode = p.argument.valueExpression;
            if (!argNode) {
                continue;
            }
            const funcParam = result.type.details.parameters.find((a) => a.name && a.name === p.paramName);
            if (funcParam?.category !== ParameterCategory.Simple) {
                continue;
            }
            // Arguments starting with double underscores usually come from type stubs,
            // they're probably not very informative. If necessary, an option can be added
            // whether to hide such names or not.
            if (p.paramName?.startsWith('__')) {
                continue;
            }
            if (argNode.nodeType === ParseNodeType.Name && p.paramName === argNode.value) {
                continue;
            }
            if (p.paramName) {
                this.featureItems.push({
                    inlayHintType: 'parameter',
                    position: argNode.start,
                    value: `${p.paramName}=`,
                });
            }
        }
    }

    private _printType = (type: Type): string =>
        this._program.evaluator!.printType(type, { enforcePythonSyntax: true });
}
