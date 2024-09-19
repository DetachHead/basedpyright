import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Uri } from './common/uri/uri';
import { convertLevelToCategory, Diagnostic, DiagnosticCategory } from './common/diagnostic';
import { extraOptionDiagnosticRules } from './common/configOptions';

interface BaselinedDiagnostic {
    code: DiagnosticRule | undefined;
    range: { startColumn: number; endColumn: number };
}

interface BaselineFile {
    files: {
        [filePath: string]: BaselinedDiagnostic[];
    };
}

export const baselineFilePath = (rootDir: Uri) => rootDir.combinePaths('.basedpyright/baseline.json');

const diagnosticsToBaseline = (rootDir: Uri, filesWithDiagnostics: readonly FileDiagnostics[]): BaselineFile => {
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
                ].includes(diagnostic.category) || diagnostic.baselineStatus === 'baselined with hint'
        );
        if (!(filePath in baselineData.files)) {
            baselineData.files[filePath] = [];
        }
        if (!errorDiagnostics.length) {
            continue;
        }
        baselineData.files[filePath].push(
            ...errorDiagnostics.map((diagnostic) => ({
                code: diagnostic.getRule() as DiagnosticRule | undefined,
                range: { startColumn: diagnostic.range.start.character, endColumn: diagnostic.range.end.character },
            }))
        );
    }
    return baselineData;
};

const writeBaselineFile = (rootDir: Uri, baselineData: BaselineFile) => {
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
    filesWithDiagnostics: readonly FileDiagnostics[],
    openFilesOnly: boolean
) => {
    let baselineData = diagnosticsToBaseline(rootDir, filesWithDiagnostics);
    if (openFilesOnly) {
        baselineData = { files: { ...getBaselinedErrors(rootDir).files, ...baselineData.files } };
    }
    // remove files where there are no errors
    for (const file in baselineData.files) {
        if (!baselineData.files[file].length) {
            delete baselineData.files[file];
        }
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

export const getBaselinedErrorsForFile = (rootDir: Uri, file: Uri): BaselinedDiagnostic[] => {
    const relativePath = rootDir.getRelativePath(file);
    let result;
    // if this is undefined it means the file isn't in the workspace
    if (relativePath) {
        result = getBaselinedErrors(rootDir).files[rootDir.getRelativePath(file)!.toString()];
    }
    return result ?? [];
};

export const filterOutBaselinedDiagnostics = (rootDir: Uri, file: Uri, diagnostics: Diagnostic[]) => {
    const baselinedErrorsForFile = getBaselinedErrorsForFile(rootDir, file);
    for (const index in diagnostics) {
        const diagnostic = diagnostics[index];
        const diagnosticRule = diagnostic.getRule() as DiagnosticRule | undefined;
        const matchedIndex = baselinedErrorsForFile.findIndex(
            (baselinedError) =>
                baselinedError.code === diagnosticRule &&
                baselinedError.range.startColumn === diagnostic.range.start.character &&
                baselinedError.range.endColumn === diagnostic.range.end.character
        );
        if (matchedIndex >= 0) {
            baselinedErrorsForFile.splice(matchedIndex, 1);
            // if the baselined error can be reported as a hint (eg. unreachable/deprecated), keep it and change its diagnostic level to that instead
            // TODO: should we only baseline errors and not warnings/notes?
            if (diagnosticRule) {
                for (const { name, get } of extraOptionDiagnosticRules) {
                    if (get().includes(diagnosticRule)) {
                        const newDiagnostic = new Diagnostic(
                            convertLevelToCategory(name),
                            diagnostic.message,
                            diagnostic.range,
                            diagnostic.priority
                        );
                        newDiagnostic.baselineStatus = 'baselined with hint';
                        const rule = diagnostic.getRule();
                        if (rule) {
                            newDiagnostic.setRule(rule);
                        }
                        diagnostics[index] = newDiagnostic;
                        // none of these rules should have multiple extra diagnostic levels so we break after the first match
                        break;
                    }
                }
            }
            diagnostic.baselineStatus = 'baselined';
        }
    }
};
