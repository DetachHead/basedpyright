import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Range } from './common/textRange';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Uri } from './common/uri/uri';
import { convertLevelToCategory, Diagnostic, DiagnosticCategory } from './common/diagnostic';
import { extraOptionDiagnosticRules } from './common/configOptions';

interface BaselinedDiagnostic {
    code: DiagnosticRule | undefined;
    range: Range;
}

interface BaselineFile {
    files: {
        [filePath: string]: BaselinedDiagnostic[];
    };
}

export const baselineFilePath = (rootDir: Uri) => rootDir.combinePaths('.basedpyright/baseline.json');

export const diagnosticsToBaseline = (rootDir: Uri, filesWithDiagnostics: FileDiagnostics[]): BaselineFile => {
    const baselineData: BaselineFile = {
        files: {},
    };
    for (const fileWithDiagnostics of filesWithDiagnostics) {
        const filePath = rootDir.getRelativePath(fileWithDiagnostics.fileUri)!.toString();
        const errorDiagnostics = fileWithDiagnostics.diagnostics.filter(
            (diagnostic) =>
                ![
                    DiagnosticCategory.Deprecated,
                    DiagnosticCategory.UnreachableCode,
                    DiagnosticCategory.UnusedCode,
                ].includes(diagnostic.category)
        );
        if (!errorDiagnostics.length) {
            continue;
        }
        if (!(filePath in baselineData.files)) {
            baselineData.files[filePath] = [];
        }
        baselineData.files[filePath].push(
            ...errorDiagnostics.map((diagnostic) => ({
                code: diagnostic.getRule() as DiagnosticRule | undefined,
                range: diagnostic.range,
            }))
        );
    }
    return baselineData;
};

export const writeBaselineFile = (rootDir: Uri, baselineData: BaselineFile) => {
    const baselineFile = baselineFilePath(rootDir);
    mkdirSync(baselineFile.getDirectory().getPath(), { recursive: true });
    writeFileSync(baselineFile.getPath(), JSON.stringify(baselineData, undefined, 4));
};

/**
 * @param openFilesOnly whether or not the diagnostics were only reported on the open files. setting this to `true` prevents
 * it from deleting baselined errors from files that weren't opened
 */
export const writeDiagnosticsToBaselineFile = async (
    rootDir: Uri,
    filesWithDiagnostics: FileDiagnostics[],
    openFilesOnly: boolean
) => {
    let baselineData = diagnosticsToBaseline(rootDir, filesWithDiagnostics);
    if (openFilesOnly) {
        baselineData = { files: { ...getBaselinedErrors(rootDir).files, ...baselineData.files } };
    }
    writeBaselineFile(rootDir, baselineData);
};

export const getBaselinedErrors = (rootDir: Uri): BaselineFile => {
    const path = baselineFilePath(rootDir).getPath();
    let baselineFileContents;
    try {
        baselineFileContents = readFileSync(path, 'utf8');
    } catch (e) {
        return { files: {} };
    }
    return JSON.parse(baselineFileContents);
};

interface FileDiagnosticsWithBaselineInfo extends FileDiagnostics {
    alreadyBaselinedDiagnostics?: BaselinedDiagnostic[];
}

export const filterOutBaselinedDiagnostics = (
    rootDir: Uri | undefined,
    filesWithDiagnostics: readonly FileDiagnostics[]
): readonly FileDiagnosticsWithBaselineInfo[] => {
    if (!rootDir) {
        return filesWithDiagnostics;
    }
    const baselineFile = getBaselinedErrors(rootDir);
    return filesWithDiagnostics.map((fileWithDiagnostics) => {
        const baselinedErrorsForFile =
            baselineFile.files[rootDir.getRelativePath(fileWithDiagnostics.fileUri)!.toString()];
        if (!baselinedErrorsForFile) {
            return fileWithDiagnostics;
        }
        const originalBaselinedErrorsForFile = [...baselinedErrorsForFile];
        const filteredDiagnostics = [];
        for (let diagnostic of fileWithDiagnostics.diagnostics) {
            const diagnosticRule = diagnostic.getRule() as DiagnosticRule | undefined;
            const matchedIndex = baselinedErrorsForFile.findIndex(
                (baselinedError) =>
                    baselinedError.code === diagnosticRule &&
                    baselinedError.range.start.character === diagnostic.range.start.character &&
                    baselinedError.range.end.character === diagnostic.range.end.character
            );
            if (matchedIndex >= 0) {
                baselinedErrorsForFile.splice(matchedIndex, 1);
                // if the baselined error can be reported as a hint (eg. unreachable/deprecated), keep it and change its diagnostic level to that instead
                // TODO: should we only baseline errors and not warnings/notes?
                if (diagnosticRule) {
                    for (const { name, get } of extraOptionDiagnosticRules) {
                        if (get().includes(diagnosticRule)) {
                            diagnostic = new Diagnostic(
                                convertLevelToCategory(name),
                                diagnostic.message,
                                diagnostic.range,
                                diagnostic.priority
                            );
                            filteredDiagnostics.push(diagnostic);
                            // none of these rules should have multiple extra diagnostic levels so we break after the first match
                            break;
                        }
                    }
                }
            } else {
                filteredDiagnostics.push(diagnostic);
            }
        }
        return {
            ...fileWithDiagnostics,
            diagnostics: filteredDiagnostics,
            alreadyBaselinedDiagnostics: originalBaselinedErrorsForFile,
        };
    });
};
