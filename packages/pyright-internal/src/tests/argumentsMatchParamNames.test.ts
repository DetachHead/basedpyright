import { ConfigOptions } from '../common/configOptions';
import { Uri } from '../common/uri/uri';
import { DiagnosticRule } from '../common/diagnosticRules';
import * as TestUtils from './testUtils';

test('it reports an error', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnnecessaryTypeIgnoreComment = 'error';
    configOptions.diagnosticRuleSet.reportPositionalArgumentNameMismatch = 'warning';
    configOptions.diagnosticRuleSet.reportUnusedParameter = 'none';

    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['argumentsMatchParamNames.py'], configOptions);

    TestUtils.validateResultsButBased(analysisResults, {
        warnings: [],
        errors: [],
    });
});
