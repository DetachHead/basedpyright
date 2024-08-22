import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Range } from './common/textRange';
import { mkdirSync, writeFileSync } from 'fs';
import { Uri } from './common/uri/uri';

interface BaselineFile {
    files: {
        [filePath: string]: {
            code: DiagnosticRule | undefined;
            message: string;
            range: Range;
        }[];
    };
}

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

export const writeBaseline = async (
    rootDir: Uri,
    baselineFilePath: string,
    filesWithDiagnostics: FileDiagnostics[]
) => {
    const baselineData = diagnosticsToBaseline(rootDir, filesWithDiagnostics);
    const baselineFile = rootDir.combinePaths(baselineFilePath);
    mkdirSync(baselineFile.getDirectory().getPath(), { recursive: true });
    writeFileSync(baselineFile.getPath(), JSON.stringify(baselineData, undefined, 4));
};
