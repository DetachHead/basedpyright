import { ServerCommand } from './commandController';
import { writeDiagnosticsToBaselineFile } from '../baseline';
import { LanguageServerInterface } from '../common/languageServerInterface';

export class WriteBaselineCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {
        // Empty
    }

    async execute(): Promise<any> {
        // TODO: figure out a better way to get workspace root
        const workspaceRoot = (
            await this._ls.getWorkspaceForFile(
                this._ls.documentsWithDiagnostics[Object.keys(this._ls.documentsWithDiagnostics)[0]].fileUri
            )
        ).rootUri!;
        return writeDiagnosticsToBaselineFile(workspaceRoot, Object.values(this._ls.documentsWithDiagnostics), true);
    }
}
