import { ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('assert_never', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnnecessaryComparison = 'error';

    const analysisResults = typeAnalyzeSampleFiles(['reportUnnecessaryComparison.py'], configOptions);
    validateResultsButBased(analysisResults, {
        errors: [
            { code: DiagnosticRule.reportUnnecessaryComparison, line: 16 },
            { code: DiagnosticRule.reportUnnecessaryComparison, line: 24 },
        ],
        hints: [{ code: DiagnosticRule.reportUnreachable, line: 25 }],
    });
});
