import path from 'path';
import { BasedConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { resolveSampleFilePath, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

const typeAnalyzeFilesWithBaseline = (sampleFolderName: string, files: string[]) => {
    const sampleFolder = path.join('baseline', sampleFolderName);
    return typeAnalyzeSampleFiles(
        files.map((file) => path.join(sampleFolder, file)),
        (serviceProvider) => new BasedConfigOptions(Uri.file(resolveSampleFilePath(sampleFolder), serviceProvider))
    );
};

test('baselined error not reported', () => {
    const analysisResults = typeAnalyzeFilesWithBaseline('baselined_error_not_reported', ['foo.py']);

    validateResultsButBased(analysisResults, {
        errors: [
            { line: 0, code: DiagnosticRule.reportAssignmentType, baselineStatus: 'baselined' },
            { line: 1, code: DiagnosticRule.reportUndefinedVariable },
        ],
        warnings: [{ line: 1, code: DiagnosticRule.reportUnusedExpression }],
    });
});

test('baselined error that can be reported as a hint gets converted to a hint', () => {
    const analysisResults = typeAnalyzeFilesWithBaseline('baselined_hint', ['foo.py']);

    validateResultsButBased(analysisResults, {
        unreachableCodes: [{ line: 1, code: DiagnosticRule.reportUnreachable, baselineStatus: 'baselined with hint' }],
        warnings: [{ line: 3, code: DiagnosticRule.reportUnreachable }],
    });
});
