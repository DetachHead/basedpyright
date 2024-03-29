import { ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { UriEx } from '../common/uri/uriUtils';
import { resolveSampleFilePath, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('reportImplicitRelativeImport', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportImplicitRelativeImport = 'error';
    //TODO: typeAnalyzeSampleFiles should probably do this by default
    configOptions.projectRoot = UriEx.file(resolveSampleFilePath('based_implicit_relative_import'));
    const analysisResults = typeAnalyzeSampleFiles(['based_implicit_relative_import/asdf/bar.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            {
                line: 1,
                code: DiagnosticRule.reportImplicitRelativeImport,
                message:
                    'Import from `foo` is implicitly relative and will not work if this file is imported as a module\n  Use a relative import from `.foo` instead\n  or specify the full module path: `asdf.foo`',
            },
        ],
    });
});
