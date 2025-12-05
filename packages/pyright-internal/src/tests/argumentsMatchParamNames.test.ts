import { ConfigOptions } from '../common/configOptions';
import { Uri } from '../common/uri/uri';
import { DiagnosticRule } from '../common/diagnosticRules';
import * as TestUtils from './testUtils';

test('it reports an error', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportPositionalArgumentNameMismatch = 'warning';
    configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';

    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['argumentsMatchParamNames.py'], configOptions);

    TestUtils.validateResultsButBased(analysisResults, {
        warnings: [
            {
                line: 11,
                code: DiagnosticRule.reportPositionalArgumentNameMismatch,
            },
        ],
    });
});

test('it reports an error for built-in functions', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportPositionalArgumentNameMismatchForBuiltIns = 'warning';
    configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';

    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['argumentsMatchParamNames.py'], configOptions);

    TestUtils.validateResultsButBased(analysisResults, {
        warnings: [
            {
                line: 25,
                code: DiagnosticRule.reportPositionalArgumentNameMismatchForBuiltIns,
            },
        ],
    });
});
