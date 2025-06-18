import { Range } from 'vscode-languageserver-types';
import { ParseTreeWalker } from '../analyzer/parseTreeWalker';
import { isDunderName, isUnderscoreOnlyName } from '../analyzer/symbolNameUtils';
import {
    ClassType,
    FunctionType,
    Type,
    getTypeAliasInfo,
    isAny,
    isClass,
    isInstantiableClass,
    isParamSpec,
    isPositionOnlySeparator,
    isTypeVar,
} from '../analyzer/types';
import { ProgramView } from '../common/extensibility';
import { limitOverloadBasedOnCall } from '../languageService/tooltipUtils';
import {
    CallNode,
    ClassNode,
    FunctionNode,
    NameNode,
    ParamCategory,
    ParseNode,
    ParseNodeBase,
    ParseNodeType,
    TypeAnnotationNode,
} from '../parser/parseNodes';
import { isLiteralType } from './typeUtils';
import { TextRange } from '../common/textRange';
import { convertRangeToTextRange } from '../common/positionUtils';
import { transformTypeForEnumMember } from './enums';
import { InlayHintSettings } from '../workspaceFactory';
import { ImportTracker, ImportTrackerResults } from './typePrinter';
import { Uri } from '../common/uri/uri';
import { ParseFileResults } from '../parser/parser';

export type TypeInlayHintsItemType = {
    inlayHintType: 'variable' | 'functionReturn' | 'parameter' | 'generic';
    position: number;
    value: string;
    imports?: ImportTrackerResults;
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
    if (type.shared.moduleName !== 'builtins') {
        return false;
    }
    const funcName = type.shared.name;
    if (funcName === '__new__' || funcName === '__init__') {
        return ignoredBuiltinTypes.has(type.shared.fullName);
    }
    return ignoredBuiltinFunctions.has(type.shared.fullName);
}

function isLeftSideOfAssignment(node: ParseNode): boolean {
    if (node.parent?.nodeType !== ParseNodeType.Assignment) {
        return false;
    }
    return node.start < node.parent.d.rightExpr.start;
}

export class TypeInlayHintsWalker extends ParseTreeWalker {
    featureItems: TypeInlayHintsItemType[] = [];
    parseResults?: ParseFileResults;
    private _range: TextRange | undefined;
    private _variablesThatShouldntHaveInlayHints = new Set<ParseNode>();

    constructor(
        private readonly _program: ProgramView,
        private _settings: InlayHintSettings,
        private _fileUri: Uri,
        range?: Range
    ) {
        super();
        this.parseResults = this._program.getParseResults(_fileUri);
        if (this.parseResults) {
            const lines = this.parseResults.tokenizerOutput.lines;
            if (range && lines) {
                this._range = convertRangeToTextRange(range, lines);
            }
        }
    }

    override visitClass(node: ClassNode): boolean {
        const evaluator = this._program.evaluator;
        if (evaluator) {
            const classType = evaluator.getTypeOfClass(node)?.classType;
            // prevent inlay hints from appearing on enum members
            if (classType && ClassType.isEnumClass(classType)) {
                ClassType.getSymbolTable(classType).forEach((symbol, name) => {
                    const symbolType = transformTypeForEnumMember(evaluator, classType, name, true);
                    if (symbolType) {
                        const nameNode = symbol.getDeclarations()[0]?.node;
                        if (nameNode) {
                            this._variablesThatShouldntHaveInlayHints.add(nameNode);
                        }
                    }
                });
            }
        }
        return super.visitClass(node);
    }

    override visitName(node: NameNode): boolean {
        if (
            this._settings.variableTypes &&
            this._checkInRange(node) &&
            isLeftSideOfAssignment(node) &&
            !isDunderName(node.d.value) &&
            !isUnderscoreOnlyName(node.d.value) &&
            !this._variablesThatShouldntHaveInlayHints.has(node)
        ) {
            const evaluator = this._program.evaluator;
            const type = evaluator?.getType(node);
            if (
                evaluator &&
                type &&
                !isAny(type) &&
                !(isClass(type) && isLiteralType(type)) &&
                !isTypeVar(type) &&
                !isParamSpec(type)
            ) {
                let importTracker: ImportTracker;
                let inlayHintValue;
                if (
                    type.props?.typeAliasInfo &&
                    node.nodeType === ParseNodeType.Name &&
                    // prevent variables whose type comes from a type alias from being incorrectly treated as a TypeAlias.
                    getTypeAliasInfo(type)?.shared.name === node.d.value
                ) {
                    inlayHintValue = 'TypeAlias';
                    importTracker = new ImportTracker(this._fileUri, (name) => evaluator.getTypingType(node, name));
                    importTracker.addTypingImport(inlayHintValue);
                } else {
                    const result = this._printType(node, type);
                    inlayHintValue = result.value;
                    importTracker = result.imports;
                }
                this.featureItems.push({
                    inlayHintType: 'variable',
                    position: this._endOfNode(node),
                    value: `: ${inlayHintValue}`,
                    imports: importTracker.result,
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
        if (this._settings.functionReturnTypes && this._checkInRange(node)) {
            const evaluator = this._program.evaluator;
            const functionType = evaluator?.getTypeOfFunction(node)?.functionType;
            if (functionType !== undefined && !functionType.shared.declaredReturnType) {
                const inferredReturnType = evaluator?.getInferredReturnType(functionType);
                if (inferredReturnType) {
                    const { imports, value } = this._printType(node, inferredReturnType);
                    this.featureItems.push({
                        inlayHintType: 'functionReturn',
                        position: node.d.suite.start,
                        value: `-> ${value}`,
                        imports: imports.result,
                    });
                }
            }
        }

        return super.visitFunction(node);
    }

    override visitTypeAnnotation(node: TypeAnnotationNode): boolean {
        if (this._settings.genericTypes && this._checkInRange(node)) {
            const evaluator = this._program.evaluator;
            if (evaluator) {
                const annotationType = evaluator.getType(node.d.annotation);
                if (
                    annotationType &&
                    isInstantiableClass(annotationType) &&
                    (ClassType.isBuiltIn(annotationType, 'Final') || ClassType.isBuiltIn(annotationType, 'ClassVar'))
                ) {
                    const valueType = evaluator.getType(node.d.valueExpr);
                    if (valueType) {
                        const { value, imports } = this._printType(node, valueType);
                        this.featureItems.push({
                            inlayHintType: 'generic',
                            position: this._endOfNode(node),
                            value: `[${value}]`,
                            imports: imports.result,
                        });
                    }
                }
            }
        }
        return super.visitTypeAnnotation(node);
    }

    private _checkInRange = (node: ParseNodeBase<ParseNodeType>) =>
        !this._range || TextRange.overlapsRange(this._range, TextRange.create(node.start, node.length));

    private _generateHintsForCallNode(node: CallNode) {
        const evaluator = this._program.evaluator;
        if (!evaluator) {
            return;
        }
        const callableType = evaluator.getType(node.d.leftExpr);
        if (!callableType) {
            return;
        }

        // inlay hints for generics
        if (
            this._settings.genericTypes &&
            // where the type is not explicitly specified (theoretically we could show them on all node types that aren't
            // `ParseNodeType.Index`, but we don't because it would probably look weird to show them on any other type of expression)
            node.d.leftExpr.nodeType === ParseNodeType.Name &&
            // don't show them on super calls because that's invalid.
            node.d.leftExpr.d.value !== 'super' &&
            // only show them on classes, because the index syntax to specify generics isn't valid on functions
            isClass(callableType) &&
            // pseudo-generic classes aren't actually generic, so it's invalid to explicitly specify them
            !ClassType.isPseudoGenericClass(callableType)
        ) {
            const returnType = evaluator.getType(node);
            if (
                returnType &&
                isClass(returnType) &&
                returnType.priv.typeArgs?.length === returnType.shared.typeParams.length
            ) {
                const printedTypeArgs = returnType.priv.typeArgs.flatMap((typeArg) =>
                    isClass(typeArg) && typeArg.priv.tupleTypeArgs && typeArg.priv.isUnpacked
                        ? typeArg.priv.tupleTypeArgs.map((tupleTypeArg) => this._printType(node, tupleTypeArg.type))
                        : this._printType(node, typeArg)
                );
                const imports = printedTypeArgs.map((inlayHintInfo) => inlayHintInfo.imports);
                const values = printedTypeArgs.map((inlayHintInfo) => inlayHintInfo.value);
                if (returnType.priv.tupleTypeArgs) {
                    // for tuples, as far as i can tell there's no cases where it can infer non-variadic generics, so we just always
                    // add the ellipsis
                    values.push('...');
                }
                this.featureItems.push({
                    inlayHintType: 'generic',
                    position: this._endOfNode(node.d.leftExpr),
                    value: `[${values.join(', ')}]`,
                    imports: {
                        imports: new Set(imports.flatMap((imp) => Array.from(imp.result.imports))),
                        importFroms: new Map(imports.flatMap((imp) => Array.from(imp.result.importFroms.entries()))),
                    },
                });
            }
        }

        if (!this._settings.callArgumentNames) {
            return;
        }

        // if it's an overload, figure out which one to use based on the arguments:
        const matchedFunctionType = limitOverloadBasedOnCall(evaluator, callableType, node.d.leftExpr);
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

        const positionalOnlySeparatorIndex = result.type.shared.parameters.findIndex(isPositionOnlySeparator);

        for (const index in result.match.argParams) {
            const p = result.match.argParams[index];
            if (Number(index) < positionalOnlySeparatorIndex) {
                // don't show inlay hints for positional only arguments
                continue;
            }
            // If the argument is specified as a keyword argument, there is no need to generate a hint
            if (p.argument.name) {
                continue;
            }
            const argNode = p.argument.valueExpression;
            if (!argNode) {
                continue;
            }
            const funcParam = result.type.shared.parameters.find((a) => a.name && a.name === p.paramName);
            if (funcParam?.category !== ParamCategory.Simple) {
                continue;
            }
            // Arguments starting with double underscores usually come from type stubs,
            // they're probably not very informative. If necessary, an option can be added
            // whether to hide such names or not.
            if (p.paramName?.startsWith('__')) {
                continue;
            }
            if (
                argNode.nodeType === ParseNodeType.Name &&
                p.paramName === argNode.d.value &&
                !this._settings.callArgumentNamesMatching
            ) {
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

    private _endOfNode = (node: ParseNode) => node.start + node.length;

    private _printType = (node: ParseNode, type: Type): { value: string; imports: ImportTracker } => {
        const importTracker = new ImportTracker(this._fileUri, (name) =>
            this._program.evaluator!.getTypingType(node, name)
        );
        return {
            value: this._program.evaluator!.printType(type, { enforcePythonSyntax: true, importTracker }),
            imports: importTracker,
        };
    };
}
