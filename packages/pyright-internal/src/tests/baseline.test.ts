import { ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('baselined error not reported', () => {
    const analysisResults = typeAnalyzeSampleFiles(
        ['baseline/baselined_error_not_reported/foo.py'],
        new ConfigOptions(Uri.file(process.cwd(), serviceProvider))
    );

    validateResultsButBased(analysisResults, { errors: [{ line: 1, code: DiagnosticRule.reportUndefinedVariable }] });
});
