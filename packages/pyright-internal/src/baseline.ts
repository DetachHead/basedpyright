import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Uri } from './common/uri/uri';
import { convertLevelToCategory, Diagnostic, DiagnosticCategory } from './common/diagnostic';
import { extraOptionDiagnosticRules } from './common/configOptions';
import { fileExists } from './common/uri/uriUtils';
import { FileSystem, ReadOnlyFileSystem } from './common/fileSystem';
import { pluralize } from './common/stringUtils';

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

const writeBaselineFile = (fileSystem: FileSystem, rootDir: Uri, baselineData: BaselineFile) => {
    const baselineFile = baselineFilePath(rootDir);
    fileSystem.mkdirSync(baselineFile.getDirectory(), { recursive: true });
    fileSystem.writeFileSync(baselineFile, JSON.stringify(baselineData, undefined, 4), null);
};

/**
 * @param openFilesOnly whether or not we know that the diagnostics were only reported on the open files. setting this
 * to `true` prevents it from checking whether or not previously baselined files still exist, which probably makes it
 * faster
 * @returns the new contents of the baseline file
 */
export const writeDiagnosticsToBaselineFile = (
    fs: FileSystem,
    rootDir: Uri,
    filesWithDiagnostics: readonly FileDiagnostics[],
    openFilesOnly: boolean
): BaselineFile => {
    const newBaseline = diagnosticsToBaseline(rootDir, filesWithDiagnostics).files;
    const previousBaseline = getBaselinedErrors(fs, rootDir).files;
    // we don't know for sure that basedpyright was run on every file that was included when the previous baseline was
    // generated, so we check previously baselined files that aren't in the new baseline to see if they still exist. if
    // not, we assume the file was renamed or deleted and therefore its baseline entry should be removed. when
    // `openFilesOnly` is `true` we skip the file exists check to make the langusge server faster because it's very
    // likely that lots of files are missing from the new baseline.
    for (const filePath in previousBaseline) {
        if (!newBaseline[filePath] && (openFilesOnly || fileExists(fs, rootDir.combinePaths(filePath)))) {
            newBaseline[filePath] = previousBaseline[filePath];
        }
    }
    // remove files where there are no errors
    for (const file in newBaseline) {
        if (!newBaseline[file].length) {
            delete newBaseline[file];
        }
    }
    const result = { files: newBaseline };
    writeBaselineFile(fs, rootDir, result);
    return result;
};

export const getBaselineSummaryMessage = (rootDir: Uri, previousBaseline: BaselineFile, newBaseline: BaselineFile) => {
    const baselinedErrorCount = Object.values(previousBaseline.files).flatMap((file) => file).length;
    const newErrorCount = Object.values(newBaseline.files).flatMap((file) => file).length;

    const diff = newErrorCount - baselinedErrorCount;
    let message = '';
    if (diff === 0) {
        message += "error count didn't change";
    } else if (diff > 0) {
        message += `went up by ${diff}`;
    } else {
        message += `went down by ${diff * -1}`;
    }

    return `updated ${rootDir.getRelativePath(baselineFilePath(rootDir))} with ${pluralize(
        newErrorCount,
        'error'
    )} (${message})`;
};

export const getBaselinedErrors = (fs: ReadOnlyFileSystem, rootDir: Uri): BaselineFile => {
    const path = baselineFilePath(rootDir);
    let baselineFileContents;
    try {
        baselineFileContents = fs.readFileSync(path, 'utf8');
    } catch (e) {
        return { files: {} };
    }
    return JSON.parse(baselineFileContents);
};

export const getBaselinedErrorsForFile = (fs: ReadOnlyFileSystem, rootDir: Uri, file: Uri): BaselinedDiagnostic[] => {
    const relativePath = rootDir.getRelativePath(file);
    let result;
    // if this is undefined it means the file isn't in the workspace
    if (relativePath) {
        result = getBaselinedErrors(fs, rootDir).files[rootDir.getRelativePath(file)!.toString()];
    }
    return result ?? [];
};

export const filterOutBaselinedDiagnostics = (
    fs: ReadOnlyFileSystem,
    rootDir: Uri,
    file: Uri,
    diagnostics: Diagnostic[]
) => {
    const baselinedErrorsForFile = getBaselinedErrorsForFile(fs, rootDir, file);
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
