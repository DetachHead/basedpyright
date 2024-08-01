// Temporary fork of PyrightServer that drops hard dependencies on the real file system.

/*
 * server.ts
 *
 * Implements pyright language server.
 */

import { ImportResolver } from 'pyright-internal/analyzer/importResolver';
import { BackgroundAnalysisBase, BackgroundAnalysisRunnerBase } from 'pyright-internal/backgroundAnalysisBase';
import { InitializationData } from 'pyright-internal/backgroundThreadBase';
import { ConfigOptions } from 'pyright-internal/common/configOptions';
import { Host, NoAccessHost } from 'pyright-internal/common/host';
import { RealLanguageServer } from 'pyright-internal/realLanguageServer';
import { normalizeSlashes } from 'pyright-internal/common/pathUtils';
import { createWorker, parentPort } from 'pyright-internal/common/workersHost';
import { TestFileSystem } from 'pyright-internal/tests/harness/vfs/filesystem';
import { Connection, CreateFile, DeleteFile, InitializeParams, InitializeResult } from 'vscode-languageserver';
import { Uri } from 'pyright-internal/common/uri/uri';
import { InvalidatedReason } from 'pyright-internal/analyzer/backgroundAnalysisProgram';
import { getRootUri } from 'pyright-internal/common/uri/uriUtils';
import { ServiceProvider } from 'pyright-internal/common/serviceProvider';
import { DefaultCancellationProvider } from 'pyright-internal/common/cancellationUtils';
import { nullFileWatcherHandler } from 'pyright-internal/common/fileWatcher';

type InitialFiles = Record<string, string>;

export class PyrightBrowserServer extends RealLanguageServer {
    private _initialFiles: InitialFiles | undefined;

    constructor(connection: Connection) {
        const testFileSystem = new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });
        super(connection, 0, testFileSystem, new DefaultCancellationProvider(), testFileSystem, nullFileWatcherHandler);
    }

    createBackgroundAnalysis(): BackgroundAnalysisBase | undefined {
        // Ignore cancellation restriction for now. Needs investigation for browser support.
        const result = new BrowserBackgroundAnalysis(this.serviceProvider);
        if (this._initialFiles) {
            result.initializeFileSystem(this._initialFiles);
        }
        return result;
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
            (this.serverOptions.serviceProvider.fs() as TestFileSystem).apply({
                ...files,
                // virtual module generated in webpack config
                ...require('typeshed-json'),
            });
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
    constructor(initialData: InitializationData, serviceProvider?: ServiceProvider) {
        super(parentPort(), initialData, serviceProvider);
    }
    createRealFileSystem() {
        return new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });
    }
    protected override createRealTempFile() {
        return this.createRealFileSystem();
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
