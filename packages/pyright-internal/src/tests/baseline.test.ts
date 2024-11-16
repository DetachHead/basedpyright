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

test('baselined error reported as a hint', () => {
    const analysisResults = typeAnalyzeFilesWithBaseline('baselined_error_not_reported', ['foo.py']);

    validateResultsButBased(analysisResults, {
        errors: [{ line: 1, code: DiagnosticRule.reportUndefinedVariable }],
        hints: [{ line: 0, code: DiagnosticRule.reportAssignmentType, baselined: true }],
        warnings: [{ line: 1, code: DiagnosticRule.reportUnusedExpression }],
    });
});

test('baselined error that can use a diagnostic tag gets converted to a hint', () => {
    //TODO: figure out a way to test the diagnostic tag, but the logic for that is now entirely handled in the language server
    const analysisResults = typeAnalyzeFilesWithBaseline('baselined_hint', ['foo.py']);

    validateResultsButBased(analysisResults, {
        hints: [{ line: 1, code: DiagnosticRule.reportUnreachable, baselined: true }],
        warnings: [{ line: 3, code: DiagnosticRule.reportUnreachable }],
    });
});
