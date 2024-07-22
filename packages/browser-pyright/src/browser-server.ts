// Temporary fork of PyrightServer that drops hard dependencies on the real file system.

/*
 * server.ts
 *
 * Implements pyright language server.
 */

import { ImportResolver } from 'pyright-internal/analyzer/importResolver';
import { BackgroundAnalysisBase, BackgroundAnalysisRunnerBase } from 'pyright-internal/backgroundAnalysisBase';
import { InitializationData } from 'pyright-internal/backgroundThreadBase';
import { CommandController } from 'pyright-internal/commands/commandController';
import { ConfigOptions } from 'pyright-internal/common/configOptions';
import { FileSystem } from 'pyright-internal/common/fileSystem';
import { Host, NoAccessHost } from 'pyright-internal/common/host';
import { PyrightServer } from 'pyright-internal/server';
import { normalizeSlashes } from 'pyright-internal/common/pathUtils';
import { createWorker, parentPort } from 'pyright-internal/common/workersHost';
import { TestFileSystem } from 'pyright-internal/tests/harness/vfs/filesystem';
import { Connection, CreateFile, DeleteFile, InitializeParams, InitializeResult } from 'vscode-languageserver';
import { Uri } from 'pyright-internal/common/uri/uri';
import { InvalidatedReason } from 'pyright-internal/analyzer/backgroundAnalysisProgram';
import { getRootUri } from 'pyright-internal/common/uri/uriUtils';
import { ServiceProvider } from 'pyright-internal/common/serviceProvider';
import { isDebugMode } from 'pyright-internal/common/core';
import { getCancellationFolderName } from 'pyright-internal/common/cancellationUtils';

type InitialFiles = Record<string, string>;

export class PyrightBrowserServer extends PyrightServer {
    private _initialFiles: InitialFiles | undefined;

    constructor(connection: Connection) {
        const fileSystem = new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });
        super(connection, 0, fileSystem);

        this.controller = new CommandController(this);
    }

    override createBackgroundAnalysis(): BackgroundAnalysisBase | undefined {
        if (isDebugMode() || !getCancellationFolderName()) {
            // Don't do background analysis if we're in debug mode or an old client
            // is used where cancellation is not supported.
            return undefined;
        }

        return new BrowserBackgroundAnalysis(this.serverOptions.serviceProvider);
    }

    protected override setupConnection(supportedCommands: string[], supportedCodeActions: string[]): void {
        super.setupConnection(supportedCommands, supportedCodeActions);
        // A non-standard way to mutate the file system.
        this.connection.onNotification('pyright/createFile', (params: CreateFile) => {
            const filePath = Uri.parse(params.uri, this.serverOptions.serviceProvider).getPath();
            (this.serverOptions.serviceProvider.fs() as TestFileSystem).apply({ [filePath]: '' });
            this.workspaceFactory.items().forEach((workspace) => {
                const backgroundAnalysis = workspace.service.backgroundAnalysisProgram.backgroundAnalysis;
                backgroundAnalysis?.createFile(params);
                workspace.service.invalidateAndForceReanalysis(InvalidatedReason.Nunya);
            });
        });
        this.connection.onNotification('pyright/deleteFile', (params: DeleteFile) => {
            const filePath = Uri.parse(params.uri, this.serverOptions.serviceProvider);
            this.serverOptions.serviceProvider.fs().unlinkSync(filePath);
            this.workspaceFactory.items().forEach((workspace) => {
                const backgroundAnalysis = workspace.service.backgroundAnalysisProgram.backgroundAnalysis;
                backgroundAnalysis?.deleteFile(params);
                workspace.service.invalidateAndForceReanalysis(InvalidatedReason.Nunya);
            });
        });
    }

    protected override initialize(
        params: InitializeParams,
        supportedCommands: string[],
        supportedCodeActions: string[]
    ): Promise<InitializeResult> {
        const { files } = params.initializationOptions;
        if (typeof files === 'object') {
            this._initialFiles = files as InitialFiles;
            (this.serverOptions.serviceProvider.fs() as TestFileSystem).apply(files);
        }
        return super.initialize(params, supportedCommands, supportedCodeActions);
    }

    protected override createHost() {
        return new NoAccessHost();
    }
}

export class BrowserBackgroundAnalysis extends BackgroundAnalysisBase {
    private static _workerIndex = 0;

    constructor(serviceProvider: ServiceProvider) {
        super(serviceProvider.console());

        const index = ++BrowserBackgroundAnalysis._workerIndex;

        const initialData: InitializationData = {
            rootUri: getRootUri(serviceProvider)?.toString() ?? '',
            serviceId: index.toString(),
            cancellationFolderName: undefined,
            runner: undefined,
            workerIndex: index,
        };
        const worker = createWorker(initialData);
        this.setup(worker);
    }
}

export class BrowserBackgroundAnalysisRunner extends BackgroundAnalysisRunnerBase {
    constructor(initialData: InitializationData, serviceProvider: ServiceProvider) {
        super(parentPort(), initialData, serviceProvider);
    }
    createRealFileSystem(): FileSystem {
        return new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });
    }
    protected override createHost(): Host {
        return new NoAccessHost();
    }
    protected override createImportResolver(
        serviceProvider: ServiceProvider,
        options: ConfigOptions,
        host: Host
    ): ImportResolver {
        // A useful point to do lazy stub aquisition?
        return new ImportResolver(serviceProvider, options, host);
    }
}
