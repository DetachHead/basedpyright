import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { Uri } from './common/uri/uri';
import { compareDiagnostics, Diagnostic, DiagnosticCategory } from './common/diagnostic';
import { fileExists } from './common/uri/uriUtils';
import { FileSystem } from './common/fileSystem';
import { pluralize } from './common/stringUtils';
import { diffArrays } from 'diff';
import { assert } from './common/debug';
import { Range } from './common/textRange';
import { add, isEqual } from 'lodash';
import { ConsoleInterface, StandardConsole } from './common/console';
import { ConfigOptions } from './common/configOptions';
import isCI from 'is-ci';

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

// baseline modes allowed in LSP server settings
// TODO: add 'ignore' mode https://github.com/DetachHead/basedpyright/issues/1524
export const serverBaselineModes = ['discard', 'auto'] as const;
export type ServerBaselineMode = (typeof serverBaselineModes)[number];

export const baselineModes = [...serverBaselineModes, 'lock'] as const;

// 'force' is not a real value for `--baselinemode`. we just use it to represent `--writebaseline`
export type BaselineMode = (typeof baselineModes)[number] | 'force';

/**
 * the JSON structure of the baseline file
 */
interface BaselineData {
    files: {
        [filePath: string]: BaselinedDiagnostic[];
    };
}

const getErrorCount = (baselineData: BaselineData) => Object.values(baselineData.files).flatMap((file) => file).length;

const getBaselineDiffSummary = (diff: number) => {
    if (diff === 0) {
        return "error count didn't change";
    } else if (diff > 0) {
        return `went up by ${diff}`;
    } else {
        return `went down by ${diff * -1}`;
    }
};

export class BaselineHandler {
    /**
     * project root can change and we need to invalidate the cache when that happens
     */
    private _cache?: { content: BaselineData | undefined; projectRoot: Uri };
    private _console: ConsoleInterface;

    constructor(private _fs: FileSystem, public configOptions: ConfigOptions, console: ConsoleInterface | undefined) {
        this._console = console ?? new StandardConsole();
    }

    get fileUri() {
        return this.configOptions.baselineFile || baselineFilePath(this.configOptions);
    }

    getContents = (): BaselineData | undefined => {
        if (!this._cache || this._cache.projectRoot !== this.configOptions.projectRoot) {
            const result = this._getContents();
            this._setCache(result);
            return result;
        } else {
            return this._cache.content;
        }
    };

    invalidateCache = () => {
        this._cache = undefined;
    };

    /**
     * updates the baseline file
     *
     * @param force whether to write the baseline file even if there are new errors or if there is no baseline
     * file yet
     * @param removeDeletedFiles whether to check whether each file listed in the baseline still exists, and
     * delete its errors from the baseline file if not. this option mainly exists for performance reasons (but
     * i haven't actually checked whether it has a noticable impact)
     * @param filesWithDiagnostics the new diagnostics to write to the baseline file
     */
    write = (
        baselineMode: BaselineMode,
        removeDeletedFiles: boolean,
        filesWithDiagnostics: readonly FileDiagnostics[]
    ): string | undefined => {
        const baselineData = this.getContents();
        if (baselineMode !== 'force') {
            if (!baselineData) {
                // there currently is no baseline file and the user did not explicitly ask for one, so we do nothing
                return undefined;
            }
            /** diagnostics that haven't yet been baselined */
            const newDiagnostics = filesWithDiagnostics.map((file) => ({
                ...file,
                diagnostics: file.diagnostics.filter(
                    (diagnostic) => !diagnostic.baselined && diagnostic.category !== DiagnosticCategory.Hint
                ),
            }));
            if (newDiagnostics.map((fileWithDiagnostics) => fileWithDiagnostics.diagnostics.length).reduce(add, 0)) {
                // there are unbaselined diagnostics and the user did not explicitly ask to update the baseline, so we do
                // nothing
                return undefined;
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
                (!removeDeletedFiles || fileExists(this._fs, this.configOptions.projectRoot.combinePaths(filePath)))
            ) {
                newBaselineFiles[filePath] = previousBaselineFiles[filePath];
            }
        }
        const newBaselineData: BaselineData = { files: {} };
        // sort the file names so they always show up in the same order
        // to prevent needless diffs between baseline files generated by the language server and the cli
        for (const file of Object.keys(newBaselineFiles).sort()) {
            // remove files where there are no errors
            if (newBaselineFiles[file].length) {
                newBaselineData.files[file] = newBaselineFiles[file];
            }
        }
        const previousBaselineData: BaselineData = { files: previousBaselineFiles };
        const previousErrorCount = getErrorCount(previousBaselineData);
        const newErrorCount = getErrorCount(newBaselineData);
        const errorCountDiff = newErrorCount - previousErrorCount;
        const shouldWriteChanges =
            // if there's a change in error count we don't need to compare everything to know we need to write changes
            Boolean(errorCountDiff) ||
            // if we aren't force writing the baseline file, we know the only possible changes to the baseline file
            // would be caused by a reduced error count
            (baselineMode === 'force' && !isEqual(previousBaselineData, newBaselineData));
        const summary = getBaselineDiffSummary(errorCountDiff);
        if (shouldWriteChanges) {
            if (baselineMode === 'auto' || baselineMode === 'force') {
                this._fs.mkdirSync(this.fileUri.getDirectory(), { recursive: true });
                try {
                    this._fs.writeFileSync(this.fileUri, JSON.stringify(newBaselineData, undefined, 4), null);
                    this.invalidateCache();
                } catch (e) {
                    this._console.error(`failed to write baseline file - ${e}`);
                    return undefined;
                }
            } else {
                const repr = `\`--baselinemode=${baselineMode}\``;
                if (baselineMode === 'lock') {
                    this._console.error(
                        `baselined errors changed but the baseline file cannot be updated when ${repr} (${summary})`
                    );
                    if (isCI) {
                        this._console.error(
                            `hint: ${repr} is the default behavior in CI. to change this, run basedpyright with \`--baselinemode=auto\``
                        );
                    }
                } else {
                    // discard any updates to the baseline file
                    baselineMode satisfies 'discard';
                    return `baseline file is outdated, run without ${repr} to update it. (${summary})`;
                }
                return undefined;
            }
        } else {
            // if there were no changes and the baseline update was not explicitly requested by the user,
            // that means nothing changed so don't show any message
            if (baselineMode !== 'force') {
                return undefined;
            }
        }
        return `updated ${this.configOptions.projectRoot.getRelativePath(
            baselineFilePath(this.configOptions)
        )} with ${pluralize(newErrorCount, 'error')} (${summary})`;
    };

    sortDiagnosticsAndMatchBaseline = (
        moduleUri: Uri,
        cell: number | undefined,
        diagnostics: Diagnostic[]
    ): Diagnostic[] => {
        // if a cell is provided, even if it's already in the url as a fragment, we need to replace it anyway because the cell may have been moved
        // if running with the lanbguage server so we need to update its index in the url.
        // treating each cell as its own file may not be the best matching strategy, but i dont use notebooks so i don't know how common it is to
        // re-order cells (which would resurface errors in all cells when we do it this way). so we'll just do this for now and see if there's any
        // user feedback about it
        if (cell !== undefined) {
            moduleUri = moduleUri.withFragment(cell.toString());
        }
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
                // if unchanged

                // update the diagnostic category of the baselined diagnostics to hint
                // TODO: should we only baseline errors/warnings and not notes?
                for (const diagnostic of change.value) {
                    assert(
                        diagnostic instanceof Diagnostic,
                        'diff thingy returned the old value instead of the new one???'
                    );
                    let newDiagnostic;
                    const diagnosticRule = diagnostic.getRule() as DiagnosticRule | undefined;
                    if (diagnosticRule) {
                        newDiagnostic = diagnostic.copy({
                            category: DiagnosticCategory.Hint,
                            baselined: true,
                        });
                        newDiagnostic.setRule(diagnosticRule);
                    }
                    if (!newDiagnostic) {
                        newDiagnostic = diagnostic.copy({ baselined: true });
                    }
                    result.push(newDiagnostic);
                }
            }
        }
        return result;
    };

    private _getContents = (): BaselineData | undefined => {
        let baselineFileContents: string | undefined;
        try {
            baselineFileContents = this._fs.readFileSync(this.fileUri, 'utf8');
        } catch (e) {
            // assume the file didn't exist
            return undefined;
        }
        try {
            return JSON.parse(baselineFileContents);
        } catch (e) {
            this._console.error(`failed to parse baseline file - ${e}`);
            return undefined;
        }
    };

    private _setCache = (content: BaselineData | undefined) => {
        this._cache = { projectRoot: this.configOptions.projectRoot, content };
    };

    private _formatUriForBaseline = (file: Uri) => {
        const relativePath = this.configOptions.projectRoot.getRelativePath(file);
        const fragment = file.fragment;
        if (fragment) {
            return `${relativePath}#${fragment}`;
        }
        return relativePath;
    };

    private _getBaselinedErrorsForFile = (file: Uri): BaselinedDiagnostic[] => {
        const relativePath = this._formatUriForBaseline(file);
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
        const failedFiles = [];
        for (const fileWithDiagnostics of filesWithDiagnostics) {
            if (!fileExists(this._fs, fileWithDiagnostics.fileUri)) {
                // can happen if the file was deleted and the language server doesn't know yet so there are still diagnostics
                // for it
                continue;
            }
            const filePath = this._formatUriForBaseline(fileWithDiagnostics.fileUri);
            if (filePath === undefined) {
                failedFiles.push(fileWithDiagnostics.fileUri.toUserVisibleString());
                continue;
            }
            const errorDiagnostics = fileWithDiagnostics.diagnostics.filter(
                (diagnostic) => diagnostic.category !== DiagnosticCategory.Hint || diagnostic.baselined
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
        if (failedFiles.length) {
            const separator = '\n- ';
            this._console.error(
                `could not baseline diagnostics for the following files because they are located outside the project root directory (${this.configOptions.projectRoot.toUserVisibleString()}):` +
                    separator +
                    failedFiles.join(separator)
            );
        }
        return baselineData;
    };
}

const lineCount = (range: Range) => range.end.line - range.start.line + 1;

export const baselineFilePath = (configOptions: ConfigOptions) =>
    configOptions.baselineFile ?? configOptions.projectRoot.combinePaths('.basedpyright/baseline.json');
