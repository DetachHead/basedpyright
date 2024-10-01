import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Uri } from './common/uri/uri';
import { compareDiagnostics, convertLevelToCategory, Diagnostic, isHintDiagnostic } from './common/diagnostic';
import { extraOptionDiagnosticRules } from './common/configOptions';
import { fileExists } from './common/uri/uriUtils';
import { FileSystem } from './common/fileSystem';
import { pluralize } from './common/stringUtils';
import { diffArrays } from 'diff';
import { assert } from './common/debug';
import { Range } from './common/textRange';
import { add } from 'lodash';

export interface BaselinedDiagnostic {
    code: DiagnosticRule | undefined;
    range: {
        startColumn: number;
        endColumn: number;
        /**
         * only in baseline files generated with version 1.18.1 or above. we don't store line numbers
         * to reduce the diff when the baseline is regenerated and to prevent baselined errors from
         * incorredtly resurfacing when lines of code are added or removed.
         */
        lineCount?: number;
    };
}

/**
 * the JSON structure of the baseline file
 */
interface BaselineData {
    files: {
        [filePath: string]: BaselinedDiagnostic[];
    };
}

type OptionalIfFalse<Bool extends boolean, T> = T | (Bool extends true ? never : undefined);

/**
 * details about the difference between the previous version and the current version of the baseline file
 */
class BaselineDiff<T extends boolean> {
    readonly baselinedErrorCount: number;
    readonly newErrorCount: number;
    readonly diff: number;

    constructor(
        private _rootDir: Uri,
        readonly previousBaseline: BaselineData,
        readonly newBaseline: BaselineData,
        private readonly _forced: T
    ) {
        this.baselinedErrorCount = Object.values(previousBaseline.files).flatMap((file) => file).length;
        this.newErrorCount = Object.values(newBaseline.files).flatMap((file) => file).length;
        this.diff = this.newErrorCount - this.baselinedErrorCount;
    }

    getSummaryMessage = (): OptionalIfFalse<T, string> => {
        let message = '';
        if (this.diff === 0) {
            if (!this._forced) {
                // if the error count didn't change and the baseline update was not explicitly requested by the user,
                // that means nothing changed so don't show any message
                return undefined as OptionalIfFalse<T, string>;
            }
            message += "error count didn't change";
        } else if (this.diff > 0) {
            message += `went up by ${this.diff}`;
        } else {
            message += `went down by ${this.diff * -1}`;
        }

        return `updated ${this._rootDir.getRelativePath(baselineFilePath(this._rootDir))} with ${pluralize(
            this.newErrorCount,
            'error'
        )} (${message})`;
    };
}

export class BaselineHandler {
    readonly fileUri: Uri;

    /**
     * when {@link baselineData} is `undefined` that means there is currently no baseline file, in which case
     * none of this functionality should be observed by the user until they explicitly opt in to the baseline
     * feature
     */
    constructor(private _fs: FileSystem, private _rootDir: Uri) {
        this.fileUri = baselineFilePath(_rootDir);
    }

    getContents = (): BaselineData | undefined => {
        let baselineFileContents: string | undefined;
        try {
            baselineFileContents = this._fs.readFileSync(this.fileUri, 'utf8');
        } catch (e) {
            // assume the file didn't exist
            return undefined;
        }
        return JSON.parse(baselineFileContents);
    };

    /**
     * updates the baseline file
     *
     * @param force whether to write the baseline file even if there are new errors or if there is not baseline
     * file yet
     * @param removeDeletedFiles whether to check whether each file listed in the baseline still exists, and
     * delete its errors from the baseline file if not. this option mainly exists for performance reasons (but
     * i haven't actually checked whether it has a noticable impact)
     * @param filesWithDiagnostics the new diagnostics to write to the baseline file
     */
    write = <T extends boolean>(
        force: T,
        removeDeletedFiles: boolean,
        filesWithDiagnostics: readonly FileDiagnostics[]
    ): OptionalIfFalse<T, BaselineDiff<T>> => {
        type Result = OptionalIfFalse<T, BaselineDiff<T>>;
        const baselineData = this.getContents();
        if (!force) {
            if (!baselineData) {
                // there currently is no baseline file and the user did not explicitly ask for one, so we do nothing
                return undefined as Result;
            }
            /** diagnostics that haven't yet been baselined */
            const newDiagnostics = filesWithDiagnostics.map((file) => ({
                ...file,
                diagnostics: file.diagnostics.filter(
                    (diagnostic) => !diagnostic.baselineStatus && !isHintDiagnostic(diagnostic)
                ),
            }));
            if (newDiagnostics.map((fileWithDiagnostics) => fileWithDiagnostics.diagnostics.length).reduce(add, 0)) {
                // there are unbaselined diagnostics and the user did not explicitly ask to update the baseline, so we do
                // nothing
                return undefined as Result;
            }
        }
        const newBaselineFiles = this._filteredDiagnosticsToBaselineFormat(filesWithDiagnostics).files;
        const previousBaselineFiles = baselineData?.files ?? {};
        // we don't know for sure that basedpyright was run on every file that was included when the previous baseline was
        // generated, so we check previously baselined files that aren't in the new baseline to see if they still exist. if
        // not, we assume the file was renamed or deleted and therefore its baseline entry should be removed. when
        // `openFilesOnly` is `true` we skip the file exists check to make the langusge server faster because it's very
        // likely that lots of files are missing from the new baseline.
        for (const filePath in previousBaselineFiles) {
            if (
                !newBaselineFiles[filePath] &&
                (!removeDeletedFiles || fileExists(this._fs, this._rootDir.combinePaths(filePath)))
            ) {
                newBaselineFiles[filePath] = previousBaselineFiles[filePath];
            }
        }
        const result: BaselineData = { files: {} };
        // sort the file names so they always show up in the same order
        // to prevent needless diffs between baseline files generated by the language server and the cli
        for (const file of Object.keys(newBaselineFiles).sort()) {
            // remove files where there are no errors
            if (newBaselineFiles[file].length) {
                result.files[file] = newBaselineFiles[file];
            }
        }
        this._fs.mkdirSync(this.fileUri.getDirectory(), { recursive: true });
        this._fs.writeFileSync(this.fileUri, JSON.stringify(result, undefined, 4), null);
        return new BaselineDiff(this._rootDir, { files: previousBaselineFiles }, result, force);
    };

    sortDiagnosticsAndMatchBaseline = (moduleUri: Uri, diagnostics: Diagnostic[]): Diagnostic[] => {
        diagnostics.sort(compareDiagnostics);
        const baselinedErrorsForFile = this._getBaselinedErrorsForFile(moduleUri);
        if (!baselinedErrorsForFile) {
            return diagnostics;
        }
        const diff = diffArrays(baselinedErrorsForFile, diagnostics, {
            comparator: (baselinedDiagnostic, diagnostic) =>
                baselinedDiagnostic.code === diagnostic.getRule() &&
                baselinedDiagnostic.range.startColumn === diagnostic.range.start.character &&
                baselinedDiagnostic.range.endColumn === diagnostic.range.end.character &&
                //for backwards compatibility with old baseline files, only check this if it's present
                (baselinedDiagnostic.range.lineCount === undefined ||
                    baselinedDiagnostic.range.lineCount === lineCount(diagnostic.range)),
        });
        const result = [];
        for (const change of diff) {
            if (change.removed) {
                continue;
            }
            if (change.added) {
                assert(change.value[0] instanceof Diagnostic, "change object wasn't a Diagnostic");
                result.push(...(change.value as Diagnostic[]));
            } else {
                // if not added and not removed
                // if the baselined error can be reported as a hint (eg. unreachable/deprecated), keep it and change its diagnostic
                // level to that instead
                // TODO: should we only baseline errors and not warnings/notes?
                for (const diagnostic of change.value) {
                    assert(
                        diagnostic instanceof Diagnostic,
                        'diff thingy returned the old value instead of the new one???'
                    );
                    let newDiagnostic;
                    const diagnosticRule = diagnostic.getRule() as DiagnosticRule | undefined;
                    if (diagnosticRule) {
                        for (const { name, get } of extraOptionDiagnosticRules) {
                            if (get().includes(diagnosticRule)) {
                                newDiagnostic = diagnostic.copy({
                                    category: convertLevelToCategory(name),
                                    baselineStatus: 'baselined with hint',
                                });
                                newDiagnostic.setRule(diagnosticRule);
                                // none of these rules should have multiple extra diagnostic levels so we break after the first match
                                break;
                            }
                        }
                    }
                    if (!newDiagnostic) {
                        newDiagnostic = diagnostic.copy({ baselineStatus: 'baselined' });
                    }
                    result.push(newDiagnostic);
                }
            }
        }
        return result;
    };

    /**
     * filters out diagnostics that are baselined, but keeps any that have been turned into hints. so you will need
     * to filter it further using {@link isHintDiagnostic} if you want those removed as well
     */
    filterOutBaselinedDiagnostics = (filesWithDiagnostics: readonly FileDiagnostics[]): readonly FileDiagnostics[] =>
        filesWithDiagnostics.map((file) => ({
            ...file,
            diagnostics: file.diagnostics.filter((diagnostic) => diagnostic.baselineStatus !== 'baselined'),
        }));

    private _getBaselinedErrorsForFile = (file: Uri): BaselinedDiagnostic[] => {
        const relativePath = this._rootDir.getRelativePath(file);
        let result;
        // if this is undefined it means the file isn't in the workspace
        if (relativePath) {
            result = this.getContents()?.files[relativePath.toString()];
        }
        return result ?? [];
    };

    private _filteredDiagnosticsToBaselineFormat = (filesWithDiagnostics: readonly FileDiagnostics[]): BaselineData => {
        const baselineData: BaselineData = {
            files: {},
        };
        for (const fileWithDiagnostics of filesWithDiagnostics) {
            const filePath = this._rootDir.getRelativePath(fileWithDiagnostics.fileUri)!.toString();
            const errorDiagnostics = fileWithDiagnostics.diagnostics.filter(
                (diagnostic) => !isHintDiagnostic(diagnostic) || diagnostic.baselineStatus === 'baselined with hint'
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
                    range: {
                        startColumn: diagnostic.range.start.character,
                        endColumn: diagnostic.range.end.character,
                        lineCount: lineCount(diagnostic.range),
                    },
                }))
            );
        }
        return baselineData;
    };
}

const lineCount = (range: Range) => range.end.line - range.start.line + 1;

export const baselineFilePath = (rootDir: Uri) => rootDir.combinePaths('.basedpyright/baseline.json');
