import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Range } from './common/textRange';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Uri } from './common/uri/uri';
// import { Diagnostic } from './common/diagnostic';

interface BaselineFile {
    files: {
        [filePath: string]: {
            code: DiagnosticRule | undefined;
            message: string;
            range: Range;
        }[];
    };
}

const baselineFilePath = (rootDir: Uri) => rootDir.combinePaths('.basedpyright/baseline.json');

const diagnosticsToBaseline = (rootDir: Uri, filesWithDiagnostics: FileDiagnostics[]): BaselineFile => {
    const baselineData: BaselineFile = {
        files: {},
    };
    for (const fileWithDiagnostics of filesWithDiagnostics) {
        const filePath = rootDir.getRelativePath(fileWithDiagnostics.fileUri)!.toString();
        if (!fileWithDiagnostics.diagnostics.length) {
            continue;
        }
        if (!(filePath in baselineData.files)) {
            baselineData.files[filePath] = [];
        }
        baselineData.files[filePath].push(
            ...fileWithDiagnostics.diagnostics.map((diagnostic) => ({
                code: diagnostic.getRule() as DiagnosticRule | undefined,
                message: diagnostic.message,
                range: diagnostic.range,
            }))
        );
    }
    return baselineData;
};

export const writeBaseline = async (rootDir: Uri, filesWithDiagnostics: FileDiagnostics[]) => {
    const baselineData = diagnosticsToBaseline(rootDir, filesWithDiagnostics);
    const baselineFile = baselineFilePath(rootDir);
    mkdirSync(baselineFile.getDirectory().getPath(), { recursive: true });
    writeFileSync(baselineFile.getPath(), JSON.stringify(baselineData, undefined, 4));
};

export const getBaselinedErrors = (rootDir: Uri): BaselineFile =>
    JSON.parse(readFileSync(baselineFilePath(rootDir).getPath(), 'utf8'));

export const filterOutBaselinedDiagnostics = (rootDir: Uri, filesWithDiagnostics: FileDiagnostics[]): void => {
    const baselineFile = getBaselinedErrors(rootDir);
    for (const fileWithDiagnostics of filesWithDiagnostics) {
        const newDiagnostics = [];
        const baselinedErrorsForFile =
            baselineFile.files[rootDir.getRelativePath(fileWithDiagnostics.fileUri)!.toString()];
        for (const diagnostic of fileWithDiagnostics.diagnostics) {
            const matchedIndex = baselinedErrorsForFile.findIndex(
                (baselinedError) =>
                    baselinedError.message === diagnostic.message &&
                    baselinedError.code === diagnostic.getRule() &&
                    baselinedError.range.start.character === diagnostic.range.start.character &&
                    baselinedError.range.end.character === diagnostic.range.end.character
            );
            if (matchedIndex >= 0) {
                baselinedErrorsForFile.splice(matchedIndex, 1);
            } else {
                newDiagnostics.push(diagnostic);
            }
        }
        fileWithDiagnostics.diagnostics = newDiagnostics;
    }
};
