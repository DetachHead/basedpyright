import { ServerCommand } from './commandController';
import {
    baselineFilePath,
    getBaselinedErrors,
    getBaselineSummaryMessage,
    writeDiagnosticsToBaselineFile,
} from '../baseline';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { matchFileSpecs } from '../common/configOptions';
import { Uri } from '../common/uri/uri';

export class WriteBaselineCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {
        // Empty
    }

    async execute(): Promise<any> {
        // TODO: figure out a better way to get workspace root
        // first we try and find the first workspace that has a baseline file and assume that's the right one
        const workspaces = await this._ls.getWorkspaces();
        if (!workspaces.length) {
            this._ls.window.showErrorMessage('cannot write to the baseline file because no workspace is open');
            return;
        }
        let workspace = workspaces.find((workspace) =>
            workspace.rootUri ? workspace.service.fs.existsSync(baselineFilePath(workspace.rootUri)) : false
        );
        if (!workspace) {
            // if there's no baseline file yet, we do it in an even hackier way, by getting the workspace from
            // any open file that has diagnostics in it.
            const firstFile = Object.values(this._ls.documentsWithDiagnostics)[0]?.fileUri;
            if (firstFile) {
                workspace = await this._ls.getWorkspaceForFile(firstFile);
            }
        }
        if (workspace) {
            const workspaceRoot = workspace.rootUri;
            if (workspaceRoot) {
                const previousBaseline = getBaselinedErrors(workspace.service.fs, workspaceRoot);
                const configOptions = workspace.service.getConfigOptions();
                // filter out excluded files. ideally they shouldn't be present at all. see
                // https://github.com/DetachHead/basedpyright/issues/31
                const filteredFiles = Object.entries(this._ls.documentsWithDiagnostics)
                    .filter(([filePath]) => matchFileSpecs(configOptions, Uri.file(filePath, this._ls.serviceProvider)))
                    .map(([_, diagnostics]) => diagnostics);
                const newBaseline = writeDiagnosticsToBaselineFile(
                    workspace.service.fs,
                    workspaceRoot,
                    filteredFiles,
                    true
                );
                workspace.service.baselineUpdated();
                this._ls.window.showInformationMessage(
                    getBaselineSummaryMessage(workspaceRoot, previousBaseline, newBaseline)
                );
                return;
            }
        }
        // the only time the rootUri would not be found if there was no baseline file and no files with any
        // diagnostics in them. this is because of the hacky method we use above to get the workspace.
        // but we disguise this as an information message because it means we don't need to write anything anyway
        this._ls.window.showInformationMessage('no baseline file was found and there are no diagnostics to baseline');
    }
}
