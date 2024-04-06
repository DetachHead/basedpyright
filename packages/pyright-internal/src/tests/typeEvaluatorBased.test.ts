import { BasedConfigOptions, ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { UriEx } from '../common/uri/uriUtils';
import { resolveSampleFilePath, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('reportUnreachable', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnreachable = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['unreachable1.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [78, 89, 106, 110].map((line) => ({ code: DiagnosticRule.reportUnreachable, line })),
        infos: [{ line: 95 }, { line: 98 }],
        unusedCodes: [{ line: 102 }],
    });
});

test('reportUnreachable TYPE_CHECKING', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnreachable = 'error';
    const analysisResults = typeAnalyzeSampleFiles(['unreachable2.py'], configOptions);

    validateResultsButBased(analysisResults, {
        unreachableCodes: [{ line: 3 }, { line: 8 }],
    });
});

test('default typeCheckingMode=all', () => {
    const configOptions = new BasedConfigOptions(Uri.empty());
    const analysisResults = typeAnalyzeSampleFiles(['unreachable1.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            ...[78, 89, 106, 110].map((line) => ({ code: DiagnosticRule.reportUnreachable, line })),
            { line: 16, code: DiagnosticRule.reportUninitializedInstanceVariable },
            { line: 19, code: DiagnosticRule.reportUnknownParameterType },
            { line: 33, code: DiagnosticRule.reportUnknownParameterType },
            { line: 94, code: DiagnosticRule.reportUnnecessaryComparison },
            { line: 102, code: DiagnosticRule.reportUnusedVariable },
        ],
        infos: [{ line: 95 }, { line: 98 }],
        unusedCodes: [{ line: 102 }],
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
