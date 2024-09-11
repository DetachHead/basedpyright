import { ServerCommand } from './commandController';
import { writeDiagnosticsToBaselineFile } from '../baseline';
import { LanguageServerInterface } from '../common/languageServerInterface';

export class WriteBaselineCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {
        // Empty
    }

    async execute(): Promise<any> {
        // TODO: figure out a better way to get workspace root
        const firstFile = this._ls.documentsWithDiagnostics[Object.keys(this._ls.documentsWithDiagnostics)[0]]?.fileUri;
        if (firstFile) {
            const workspace = await this._ls.getWorkspaceForFile(firstFile);
            const workspaceRoot = workspace.rootUri;
            if (workspaceRoot) {
                await writeDiagnosticsToBaselineFile(
                    workspaceRoot,
                    Object.values(this._ls.documentsWithDiagnostics),
                    true
                );
                workspace.service.baselineUpdated();
                return;
            }
        }
        this._ls.window.showErrorMessage('cannot write to the baseline file because no workspace is open');
    }
}
