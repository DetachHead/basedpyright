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
        unusedCodes: [{ line: 102 }],
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
            { code: DiagnosticRule.reportArgumentType, line: 12 },
            { code: DiagnosticRule.reportUnreachable, line: 17 },
        ],
    });
});

test('default typeCheckingMode=all', () => {
    // there's a better test for this in `config.test.ts` which tests it in a more complete way.
    // the logic for loading the config seems very convoluted and messy. the default typeCheckingMode
    // seems to be determined multiple times. and there was an upstream change that broke our defaulting
    // to "all" which went undetected by this test, because it was being changed to "standard" later on.
    // i'm keeping both tests just in case, because i don't really get why it gets set multiple times.
    // maybe this one effects something else
    const configOptions = new BasedConfigOptions(Uri.empty());
    const analysisResults = typeAnalyzeSampleFiles(['unreachable1.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            ...[78, 89, 106, 110, 118, 126].map((line) => ({ code: DiagnosticRule.reportUnreachable, line })),
            { line: 16, code: DiagnosticRule.reportUninitializedInstanceVariable },
            { line: 19, code: DiagnosticRule.reportUnknownParameterType },
            { line: 33, code: DiagnosticRule.reportUnknownParameterType },
            { line: 94, code: DiagnosticRule.reportUnnecessaryComparison },
            { line: 102, code: DiagnosticRule.reportUnusedVariable },
            { line: 113, code: DiagnosticRule.reportUnknownParameterType },
            { line: 113, code: DiagnosticRule.reportMissingTypeArgument },
            { line: 114, code: DiagnosticRule.reportUnnecessaryIsInstance },
            { line: 115, code: DiagnosticRule.reportUnknownVariableType },
            { line: 121, code: DiagnosticRule.reportUnknownParameterType },
            { line: 121, code: DiagnosticRule.reportMissingTypeArgument },
            { line: 122, code: DiagnosticRule.reportUnnecessaryIsInstance },
            { line: 123, code: DiagnosticRule.reportUnknownVariableType },
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
        'Subscript for class "AbstractContextManager" will generate runtime exception; enclose type annotation in quotes';
    validateResultsButBased(analysisResults, {
        errors: [
            { code: DiagnosticRule.reportGeneralTypeIssues, line: 7, message },
            { code: DiagnosticRule.reportGeneralTypeIssues, line: 9, message },
        ],
    });
});

test("useless type isn't added to union after if statement", () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportAssertTypeFailure = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['typeNarrowingBased.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [],
    });
});
