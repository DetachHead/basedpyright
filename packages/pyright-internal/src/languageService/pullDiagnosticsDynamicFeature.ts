/*
 * PullDiagnosticsDynamicFeature.ts
 * Copyright (c) Microsoft Corporation.
 *
 * implementation of pull mode diagnostics feature registration
 */
import { Connection, DiagnosticOptions, DocumentDiagnosticRequest } from 'vscode-languageserver';
import { DynamicFeature } from './dynamicFeature';
import { ServerSettings } from '../common/languageServerInterface';

export class PullDiagnosticsDynamicFeature extends DynamicFeature<DiagnosticOptions> {
    private _workspaceSupport = false;
    private _registered = false;

    protected override type = DocumentDiagnosticRequest.type;

    constructor(connection: Connection, private readonly _id: string = 'pyright') {
        super('pull diagnostics', connection);
    }

    override disable() {
        super.disable();
        this._registered = false;
    }

    override update(settings: ServerSettings): void {
        // There is one caveat with these settings. These settings can be set
        // per workspace, but these features apply to the entire language server.
        // Therefore, if the user has set these settings differently per workspace,
        // the last setting will take precedence.
        const workspaceSupport = settings.openFilesOnly === false;
        if (this._workspaceSupport !== workspaceSupport || !this._registered) {
            this._workspaceSupport = workspaceSupport;
            this.register();
        }
    }

    protected override featureOptions() {
        this._registered = true;
        return {
            options: {
                interFileDependencies: true,
                workspaceDiagnostics: this._workspaceSupport,
                documentSelector: null,
                identifier: this._id,
            },
            key: JSON.stringify([this._workspaceSupport, this._id]),
        };
    }
}
