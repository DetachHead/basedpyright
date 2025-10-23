import { BasedConfigOptions, ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { pythonVersion3_8 } from '../common/pythonVersion';
import { Uri } from '../common/uri/uri';
import { UriEx } from '../common/uri/uriUtils';
import { resolveSampleFilePath, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('reportUnreachable', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnreachable = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['unreachable1.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [78, 89, 106, 110, 118, 126].map((line) => ({ code: DiagnosticRule.reportUnreachable, line })),
        infos: [{ line: 95 }, { line: 98 }],
        hints: [{ line: 102 }],
    });
});

test('reportUnreachable TYPE_CHECKING', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnreachable = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['unreachable2.py'], configOptions);

    //TODO: should type checking unreachable blocks still always be reported with the unreachable hint?????
    validateResultsButBased(analysisResults, {});
});

test('unreachable assert_never', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnreachable = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['unreachableAssertNever.py'], configOptions);

    validateResultsButBased(analysisResults, {
        errors: [
            { code: DiagnosticRule.reportUnreachable, line: 7 },
            { code: DiagnosticRule.reportUnreachable, line: 12 },
            { code: DiagnosticRule.reportUnreachable, line: 17 },
        ],
    });
});

test('default typeCheckingMode=recommended', () => {
    // there's a better test for this in `config.test.ts` which tests it in a more complete way.
    // the logic for loading the config seems very convoluted and messy. the default typeCheckingMode
    // seems to be determined multiple times. and there was an upstream change that broke our defaulting
    // to "all" which went undetected by this test, because it was being changed to "standard" later on.
    // i'm keeping both tests just in case, because i don't really get why it gets set multiple times.
    // maybe this one effects something else
    const configOptions = new BasedConfigOptions(Uri.empty());
    const analysisResults = typeAnalyzeSampleFiles(['unreachable1.py'], configOptions);
    validateResultsButBased(analysisResults, {
        warnings: [
            ...[78, 89, 106, 110, 118, 126].map((line) => ({ code: DiagnosticRule.reportUnreachable, line })),
            { line: 19, code: DiagnosticRule.reportUnknownParameterType },
            { line: 33, code: DiagnosticRule.reportUnknownParameterType },
            { line: 33, code: DiagnosticRule.reportInvalidAbstractMethod },
            { line: 102, code: DiagnosticRule.reportUnusedVariable },
            { line: 113, code: DiagnosticRule.reportUnknownParameterType },
            { line: 114, code: DiagnosticRule.reportUnnecessaryIsInstance },
            { line: 115, code: DiagnosticRule.reportUnknownVariableType },
            { line: 121, code: DiagnosticRule.reportUnknownParameterType },
            { line: 122, code: DiagnosticRule.reportUnnecessaryIsInstance },
            { line: 123, code: DiagnosticRule.reportUnknownVariableType },
        ],
        errors: [
            { line: 16, code: DiagnosticRule.reportUninitializedInstanceVariable },
            { line: 113, code: DiagnosticRule.reportMissingTypeArgument },
            { line: 121, code: DiagnosticRule.reportMissingTypeArgument },
        ],
        infos: [{ line: 95 }, { line: 98 }],
    });
});

test('reportPrivateLocalImportUsage', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportPrivateLocalImportUsage = 'error';
    //TODO: typeAnalyzeSampleFiles should probably do this by default
    configOptions.projectRoot = UriEx.file(resolveSampleFilePath('based_implicit_re_export'));
    const analysisResults = typeAnalyzeSampleFiles(['based_implicit_re_export/baz.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            {
                line: 0,
                code: DiagnosticRule.reportPrivateLocalImportUsage,
                message: '"a" is not exported from module "asdf.bar"\n  Import from "asdf.foo" instead',
            },
            {
                line: 0,
                code: DiagnosticRule.reportPrivateLocalImportUsage,
                message: '"b" is not exported from module "asdf.bar"\n  Import from "asdf.foo" instead',
            },
        ],
    });
});

test('reportInvalidCast', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportInvalidCast = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['cast.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            { code: DiagnosticRule.reportInvalidCast, line: 4 },
            { code: DiagnosticRule.reportInvalidCast, line: 5 },
        ],
    });
});

test('subscript context manager types on 3.8', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.defaultPythonVersion = pythonVersion3_8;
    const analysisResults = typeAnalyzeSampleFiles(['subscript_check.py'], configOptions);
    const message =
        'Subscript for class "AbstractContextManager" will generate runtime exception; enclose type expression in quotes';
    validateResultsButBased(analysisResults, {
        errors: [
            { code: DiagnosticRule.reportIndexIssue, line: 7, message },
            { code: DiagnosticRule.reportIndexIssue, line: 9, message },
        ],
    });
});

describe('narrowing type vars using their bounds', () => {
    test('enabled', () => {
        const configOptions = new ConfigOptions(Uri.empty());
        configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';
        configOptions.diagnosticRuleSet.strictGenericNarrowing = true;
        const analysisResults = typeAnalyzeSampleFiles(['typeNarrowingUsingBounds.py'], configOptions);
        validateResultsButBased(analysisResults, {
            errors: [],
            infos: [
                { line: 124, message: 'Type of "f" is "<subclass of Callable and staticmethod[..., object]>"' },
                { line: 152, message: 'Type of "value" is "<subclass of Callable and Bar>"' },
            ],
        });
    });
    test('disabled', () => {
        const configOptions = new ConfigOptions(Uri.empty());
        configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';
        configOptions.diagnosticRuleSet.strictGenericNarrowing = false;
        const analysisResults = typeAnalyzeSampleFiles(['typeNarrowingUsingBoundsDisabled.py'], configOptions);
        validateResultsButBased(analysisResults, {});
    });
});

test('`reportUnusedFunction` on `@final` classes', () => {
    const configOptions = new BasedConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportImplicitOverride = 'none';
    const analysisResults = typeAnalyzeSampleFiles(['reportUnusedFunction_final.py'], configOptions);
    validateResultsButBased(analysisResults, {
        warnings: [
            { line: 5, code: DiagnosticRule.reportUnusedFunction },
            { line: 6, code: DiagnosticRule.reportUnusedFunction },
            { line: 11, code: DiagnosticRule.reportUnusedFunction },
            { line: 21, code: DiagnosticRule.reportUnusedFunction },
        ],
    });
});

describe('uninitialized variable checking with init method calling', () => {
    test('uninitialized', () => {
        const configOptions = new BasedConfigOptions(Uri.empty());
        const analysisResults = typeAnalyzeSampleFiles(['uninitializedVariableBased1.py'], configOptions);
        validateResultsButBased(analysisResults, {
            errors: [{ line: 8, code: DiagnosticRule.reportUninitializedInstanceVariable }],
        });
    });
    test('initialized', () => {
        const configOptions = new BasedConfigOptions(Uri.empty());
        const analysisResults = typeAnalyzeSampleFiles(['uninitializedVariableBased2.py'], configOptions);
        validateResultsButBased(analysisResults, {
            errors: [],
        });
    });
});

test('`allowedUntypedLibraries` on overloaded functions', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnknownMemberType = 'error';
    //TODO: typeAnalyzeSampleFiles should probably do this by default
    configOptions.projectRoot = UriEx.file(resolveSampleFilePath('based_overloaded_functions_module_name'));

    let analysisResults = typeAnalyzeSampleFiles(['based_overloaded_functions_module_name/foobar.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            {
                line: 2,
                code: DiagnosticRule.reportUnknownMemberType,
                message:
                    'Type of "baz" is partially unknown\n  Type of "baz" is "Overload[(a: int, b: Unknown) -> int, (a: str, b: Unknown) -> str]"',
            },
        ],
    });

    configOptions.diagnosticRuleSet.allowedUntypedLibraries = ['foo'];
    analysisResults = typeAnalyzeSampleFiles(['based_overloaded_functions_module_name/foobar.py'], configOptions);
    validateResultsButBased(analysisResults, {});
});

test('`reportInvalidTypeVarUse`', () => {
    const configOptions = new BasedConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';
    const analysisResults = typeAnalyzeSampleFiles(['typeVarBased.py'], configOptions);
    validateResultsButBased(analysisResults, {
        warnings: [
            {
                line: 0,
                code: DiagnosticRule.reportInvalidTypeVarUse,
                message: 'TypeVar "T" appears only once in generic function signature\n  Use "Never" instead',
            },
            {
                line: 1,
                code: DiagnosticRule.reportInvalidTypeVarUse,
                message: 'TypeVar "T" appears only once in generic function signature\n  Use "Never" instead',
            },
            {
                line: 2,
                code: DiagnosticRule.reportInvalidTypeVarUse,
                message: 'TypeVar "T" appears only once in generic function signature\n  Use "object" instead',
            },
        ],
    });
});

describe('dataclass_transform', () => {
    test('skip_replace', () => {
        const configOptions = new ConfigOptions(Uri.empty());
        configOptions.diagnosticRuleSet.enableBasedFeatures = true;
        const analysisResults = typeAnalyzeSampleFiles(['based_dataclass_skip_replace/sample.py'], configOptions);
        validateResultsButBased(analysisResults, {
            errors: [
                {
                    code: DiagnosticRule.reportCallIssue,
                    line: 28,
                    message: 'No parameter named "z"',
                },
                {
                    code: DiagnosticRule.reportAttributeAccessIssue,
                    line: 39,
                    message:
                        'Cannot access attribute "__replace__" for class "B"\n' +
                        '  Attribute "__replace__" is unknown',
                },
                {
                    code: DiagnosticRule.reportAttributeAccessIssue,
                    line: 50,
                    message:
                        'Cannot access attribute "__replace__" for class "C"\n' +
                        '  Attribute "__replace__" is unknown',
                },
                {
                    code: DiagnosticRule.reportAttributeAccessIssue,
                    line: 62,
                    message:
                        'Cannot access attribute "__replace__" for class "D"\n' +
                        '  Attribute "__replace__" is unknown',
                },
                {
                    code: DiagnosticRule.reportAssignmentType,
                    line: 74,
                    message:
                        'Type "Box[int]" is not assignable to declared type "Box[bool]"\n' +
                        '  "Box[int]" is not assignable to "Box[bool]"\n' +
                        '    Type parameter "T@Box" is covariant, but "int" is not a subtype of "bool"\n' +
                        '      "int" is not assignable to "bool"',
                },
            ],
        });
    });
    test('returns a callable protocol', () => {
        // test for an issue that was fixed upstream but didn't have a test. see https://github.com/microsoft/pyright/issues/11015
        const configOptions = new ConfigOptions(Uri.empty());
        const analysisResults = typeAnalyzeSampleFiles(['dataclass_transform_callable_protocol.py'], configOptions);
        validateResultsButBased(analysisResults, {});
    });
    test('changes return type to something else', () => {
        // when the function decorated with `@dataclass_transform` is annotated as returning a different type, we want to ignore it
        // because `dataclass_transform`'s purpose is to transform the decorated class into a dataclass, not some other type.
        // ideally this should be an error, but pydantic (and presumably other libraries that use dataclass_transform) depend on
        // the behavior prior to pyright 1.1.407, which fixed the scenario in the 'returns a callable protocol' test but broke this one.
        // in basedpyright we modify the logic to fix the original issue without introducing a breaking change.
        const configOptions = new ConfigOptions(Uri.empty());
        const analysisResults = typeAnalyzeSampleFiles(
            ['based_dataclass_transform_changes_return_type.py'],
            configOptions
        );
        validateResultsButBased(analysisResults, {});
    });
});

test('enableBasedFeatures', () => {
    const analysisResults = typeAnalyzeSampleFiles(['enable_based_features.py']);
    validateResultsButBased(analysisResults, {
        errors: [
            {
                code: DiagnosticRule.reportGeneralTypeIssues,
                line: 4,
                message:
                    'Argument "skip_replace" is not supported by dataclass_transform\n' +
                    '  set the `enableBasedFeatures` configuration option to `true` to enable this feature',
            },
        ],
    });
});

test('self cannot have default value', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportSelfClsDefault = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['based_self_default.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            {
                code: DiagnosticRule.reportSelfClsDefault,
                line: 6,
                message: 'Parameter "self" must not have a default value',
            },
            {
                code: DiagnosticRule.reportSelfClsDefault,
                line: 9,
                message: 'Parameter "self" must not have a default value',
            },
            {
                code: DiagnosticRule.reportSelfClsDefault,
                line: 13,
                message: 'Parameter "cls" must not have a default value',
            },
        ],
    });
});
