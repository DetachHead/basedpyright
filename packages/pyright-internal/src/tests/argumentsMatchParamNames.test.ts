import { ConfigOptions } from '../common/configOptions';
import { Uri } from '../common/uri/uri';
import { DiagnosticRule } from '../common/diagnosticRules';
import * as TestUtils from './testUtils';

test('arguments_match_parameter_names reports an error', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportPositionalArgumentNameMismatch = 'warning';
    configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';

    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['argumentsMatchParamNames.py'], configOptions);

    TestUtils.validateResultsButBased(analysisResults, {
        warnings: [
            {
                line: 15,
                code: DiagnosticRule.reportPositionalArgumentNameMismatch,
            },
        ],
    });
});
