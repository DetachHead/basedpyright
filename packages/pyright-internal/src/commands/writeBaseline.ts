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
        // TODO: this very likely will delete any baselined errors from files that aren't open. FIX BEFORE MERGE!!!!!
        return writeDiagnosticsToBaselineFile(workspaceRoot, Object.values(this._ls.documentsWithDiagnostics));
    }
}
