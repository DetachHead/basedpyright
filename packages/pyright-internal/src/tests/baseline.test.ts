import path from 'path';
import { ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { resolveSampleFilePath, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

const typeAnalyzeFilesWithBaseline = (sampleFolderName: string, files: string[]) => {
    const sampleFolder = path.join('baseline', sampleFolderName);
    return typeAnalyzeSampleFiles(
        files.map((file) => path.join(sampleFolder, file)),
        (serviceProvider) => new ConfigOptions(Uri.file(resolveSampleFilePath(sampleFolder), serviceProvider))
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
