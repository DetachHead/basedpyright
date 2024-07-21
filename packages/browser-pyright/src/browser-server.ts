// Temporary fork of PyrightServer that drops hard dependencies on the real file system.

/*
 * server.ts
 *
 * Implements pyright language server.
 */

import { AnalysisResults } from 'pyright-internal/analyzer/analysis';
import { ImportResolver } from 'pyright-internal/analyzer/importResolver';
import { isPythonBinary } from 'pyright-internal/analyzer/pythonPathUtils';
import { BackgroundAnalysisBase, BackgroundAnalysisRunnerBase } from 'pyright-internal/backgroundAnalysisBase';
import { InitializationData } from 'pyright-internal/backgroundThreadBase';
import { CommandController } from 'pyright-internal/commands/commandController';
import { DefaultCancellationProvider } from 'pyright-internal/common/cancellationUtils';
import { ConfigOptions } from 'pyright-internal/common/configOptions';
import { ConsoleInterface, ConsoleWithLogLevel, LogLevel } from 'pyright-internal/common/console';
import { isString } from 'pyright-internal/common/core';
import { FileSystem, nullFileWatcherProvider } from 'pyright-internal/common/fileSystem';
import { Host, NoAccessHost } from 'pyright-internal/common/host';
import { normalizeSlashes, resolvePaths } from 'pyright-internal/common/pathUtils';
import { ProgressReporter } from 'pyright-internal/common/progressReporter';
import { createWorker, parentPort } from 'pyright-internal/common/workersHost';
import { LanguageServerBase, ServerSettings, WorkspaceServiceInstance } from 'pyright-internal/languageServerBase';
import { CodeActionProvider } from 'pyright-internal/languageService/codeActionProvider';
import { TestFileSystem } from 'pyright-internal/tests/harness/vfs/filesystem';
import { WorkspaceMap } from 'pyright-internal/workspaceMap';
import {
    CancellationToken,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Command,
    Connection,
    CreateFile,
    DeleteFile,
    ExecuteCommandParams,
    InitializeParams,
    InitializeResult,
    WorkDoneProgressServerReporter,
} from 'vscode-languageserver';

const maxAnalysisTimeInForeground = { openFilesTimeInMs: 50, noOpenFilesTimeInMs: 200 };

type InitialFiles = Record<string, string>;

export class PyrightServer extends LanguageServerBase {
    private _controller: CommandController;
    private _initialFiles: InitialFiles | undefined;

    constructor(connection: Connection) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const version = require('../package.json').version || '';

        // When executed from CLI command (pyright-langserver), __rootDirectory is
        // already defined. When executed from VSCode extension, rootDirectory should
        // be __dirname.
        const rootDirectory = (global as any).__rootDirectory || __dirname;

        const console = new ConsoleWithLogLevel(connection.console);
        const workspaceMap = new WorkspaceMap();
        const fileWatcherProvider = nullFileWatcherProvider;
        const fileSystem = new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });

        super(
            {
                productName: 'Pyright',
                rootDirectory,
                version,
                workspaceMap,
                fileSystem,
                fileWatcherProvider,
                cancellationProvider: new DefaultCancellationProvider(),
                maxAnalysisTimeInForeground,
                supportedCodeActions: [CodeActionKind.QuickFix, CodeActionKind.SourceOrganizeImports],
            },
            connection,
            console
        );

        this._controller = new CommandController(this);
    }

    protected override setupConnection(supportedCommands: string[], supportedCodeActions: string[]): void {
        super.setupConnection(supportedCommands, supportedCodeActions);
        // A non-standard way to mutate the file system.
        this._connection.onNotification('pyright/createFile', (params: CreateFile) => {
            const filePath = this._uriParser.decodeTextDocumentUri(params.uri);
            (this._serverOptions.fileSystem as TestFileSystem).apply({ [filePath]: '' });
            this._workspaceMap.forEach((workspace) => {
                const backgroundAnalysis = workspace.serviceInstance.backgroundAnalysisProgram.backgroundAnalysis;
                backgroundAnalysis?.createFile(params);
                workspace.serviceInstance.invalidateAndForceReanalysis();
            });
        });
        this._connection.onNotification('pyright/deleteFile', (params: DeleteFile) => {
            const filePath = this._uriParser.decodeTextDocumentUri(params.uri);
            this._serverOptions.fileSystem.unlinkSync(filePath);
            this._workspaceMap.forEach((workspace) => {
                const backgroundAnalysis = workspace.serviceInstance.backgroundAnalysisProgram.backgroundAnalysis;
                backgroundAnalysis?.deleteFile(params);
                workspace.serviceInstance.invalidateAndForceReanalysis();
            });
        });
    }

    protected override initialize(
        params: InitializeParams,
        supportedCommands: string[],
        supportedCodeActions: string[]
    ): InitializeResult {
        const { files } = params.initializationOptions;
        if (typeof files === 'object') {
            this._initialFiles = files as InitialFiles;
            (this._serverOptions.fileSystem as TestFileSystem).apply(files);
        }
        return super.initialize(params, supportedCommands, supportedCodeActions);
    }

    async getSettings(workspace: WorkspaceServiceInstance): Promise<ServerSettings> {
        const serverSettings: ServerSettings = {
            watchForSourceChanges: false,
            watchForLibraryChanges: false,
            watchForConfigChanges: false,
            openFilesOnly: true,
            useLibraryCodeForTypes: false,
            disableLanguageServices: false,
            disableOrganizeImports: false,
            typeCheckingMode: 'basic',
            diagnosticSeverityOverrides: {},
            logLevel: LogLevel.Info,
            autoImportCompletions: true,
        };

        try {
            const pythonSection = await this.getConfiguration(workspace.rootUri, 'python');
            if (pythonSection) {
                const pythonPath = pythonSection.pythonPath;
                if (pythonPath && isString(pythonPath) && !isPythonBinary(pythonPath)) {
                    serverSettings.pythonPath = resolvePaths(
                        workspace.rootPath,
                        this.expandPathVariables(workspace.rootPath, pythonPath)
                    );
                }

                const venvPath = pythonSection.venvPath;

                if (venvPath && isString(venvPath)) {
                    serverSettings.venvPath = resolvePaths(
                        workspace.rootPath,
                        this.expandPathVariables(workspace.rootPath, venvPath)
                    );
                }
            }

            const pythonAnalysisSection = await this.getConfiguration(workspace.rootUri, 'python.analysis');
            if (pythonAnalysisSection) {
                const typeshedPaths = pythonAnalysisSection.typeshedPaths;
                if (typeshedPaths && Array.isArray(typeshedPaths) && typeshedPaths.length > 0) {
                    const typeshedPath = typeshedPaths[0];
                    if (typeshedPath && isString(typeshedPath)) {
                        serverSettings.typeshedPath = resolvePaths(
                            workspace.rootPath,
                            this.expandPathVariables(workspace.rootPath, typeshedPath)
                        );
                    }
                }

                const stubPath = pythonAnalysisSection.stubPath;
                if (stubPath && isString(stubPath)) {
                    serverSettings.stubPath = resolvePaths(
                        workspace.rootPath,
                        this.expandPathVariables(workspace.rootPath, stubPath)
                    );
                }

                const diagnosticSeverityOverrides = pythonAnalysisSection.diagnosticSeverityOverrides;
                if (diagnosticSeverityOverrides) {
                    for (const [name, value] of Object.entries(diagnosticSeverityOverrides)) {
                        const ruleName = this.getDiagnosticRuleName(name);
                        const severity = this.getSeverityOverrides(value as string);
                        if (ruleName && severity) {
                            serverSettings.diagnosticSeverityOverrides![ruleName] = severity!;
                        }
                    }
                }

                if (pythonAnalysisSection.diagnosticMode !== undefined) {
                    serverSettings.openFilesOnly = this.isOpenFilesOnly(pythonAnalysisSection.diagnosticMode);
                } else if (pythonAnalysisSection.openFilesOnly !== undefined) {
                    serverSettings.openFilesOnly = !!pythonAnalysisSection.openFilesOnly;
                }

                if (pythonAnalysisSection.useLibraryCodeForTypes !== undefined) {
                    serverSettings.useLibraryCodeForTypes = !!pythonAnalysisSection.useLibraryCodeForTypes;
                }

                serverSettings.logLevel = this.convertLogLevel(pythonAnalysisSection.logLevel);
                serverSettings.autoSearchPaths = !!pythonAnalysisSection.autoSearchPaths;

                const extraPaths = pythonAnalysisSection.extraPaths;
                if (extraPaths && Array.isArray(extraPaths) && extraPaths.length > 0) {
                    serverSettings.extraPaths = extraPaths
                        .filter((p) => p && isString(p))
                        .map((p) => resolvePaths(workspace.rootPath, this.expandPathVariables(workspace.rootPath, p)));
                }

                if (pythonAnalysisSection.typeCheckingMode !== undefined) {
                    serverSettings.typeCheckingMode = pythonAnalysisSection.typeCheckingMode;
                }

                if (pythonAnalysisSection.autoImportCompletions !== undefined) {
                    serverSettings.autoImportCompletions = pythonAnalysisSection.autoImportCompletions;
                }

                if (
                    serverSettings.logLevel === LogLevel.Log &&
                    pythonAnalysisSection.logTypeEvaluationTime !== undefined
                ) {
                    serverSettings.logTypeEvaluationTime = pythonAnalysisSection.logTypeEvaluationTime;
                }

                if (pythonAnalysisSection.typeEvaluationTimeThreshold !== undefined) {
                    serverSettings.typeEvaluationTimeThreshold = pythonAnalysisSection.typeEvaluationTimeThreshold;
                }
            } else {
                serverSettings.autoSearchPaths = true;
            }

            const pyrightSection = await this.getConfiguration(workspace.rootUri, 'pyright');
            if (pyrightSection) {
                if (pyrightSection.openFilesOnly !== undefined) {
                    serverSettings.openFilesOnly = !!pyrightSection.openFilesOnly;
                }

                if (pyrightSection.useLibraryCodeForTypes !== undefined) {
                    serverSettings.useLibraryCodeForTypes = !!pyrightSection.useLibraryCodeForTypes;
                }

                serverSettings.disableLanguageServices = !!pyrightSection.disableLanguageServices;
                serverSettings.disableOrganizeImports = !!pyrightSection.disableOrganizeImports;

                const typeCheckingMode = pyrightSection.typeCheckingMode;
                if (typeCheckingMode && isString(typeCheckingMode)) {
                    serverSettings.typeCheckingMode = typeCheckingMode;
                }
            }
        } catch (error) {
            this.console.error(`Error reading settings: ${error}`);
        }
        return serverSettings;
    }

    createBackgroundAnalysis(): BackgroundAnalysisBase | undefined {
        // Ignore cancellation restriction for now. Needs investigation for browser support.
        const result = new BrowserBackgroundAnalysis(this.console);
        if (this._initialFiles) {
            result.initializeFileSystem(this._initialFiles);
        }
        return result;
    }

    protected override createHost() {
        return new NoAccessHost();
    }

    protected override createImportResolver(fs: FileSystem, options: ConfigOptions, host: Host): ImportResolver {
        return new ImportResolver(fs, options, host);
    }

    protected executeCommand(params: ExecuteCommandParams, token: CancellationToken): Promise<any> {
        return this._controller.execute(params, token);
    }

    protected isLongRunningCommand(command: string): boolean {
        return this._controller.isLongRunningCommand(command);
    }

    protected async executeCodeAction(
        params: CodeActionParams,
        token: CancellationToken
    ): Promise<(Command | CodeAction)[] | undefined | null> {
        this.recordUserInteractionTime();

        const filePath = this._uriParser.decodeTextDocumentUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(filePath);
        return CodeActionProvider.getCodeActionsForPosition(workspace, filePath, params.range, token);
    }

    protected createProgressReporter(): ProgressReporter {
        // The old progress notifications are kept for backwards compatibility with
        // clients that do not support work done progress.

        let workDoneProgress: Promise<WorkDoneProgressServerReporter> | undefined;
        return {
            isEnabled: (data: AnalysisResults) => true,
            begin: () => {
                if (this.client.hasWindowProgressCapability) {
                    workDoneProgress = this._connection.window.createWorkDoneProgress();
                    workDoneProgress
                        .then((progress) => {
                            progress.begin('');
                        })
                        .ignoreErrors();
                } else {
                    this._connection.sendNotification('pyright/beginProgress');
                }
            },
            report: (message: string) => {
                if (workDoneProgress) {
                    workDoneProgress
                        .then((progress) => {
                            progress.report(message);
                        })
                        .ignoreErrors();
                } else {
                    this._connection.sendNotification('pyright/reportProgress', message);
                }
            },
            end: () => {
                if (workDoneProgress) {
                    workDoneProgress
                        .then((progress) => {
                            progress.done();
                        })
                        .ignoreErrors();
                    workDoneProgress = undefined;
                } else {
                    this._connection.sendNotification('pyright/endProgress');
                }
            },
        };
    }
}

export class BrowserBackgroundAnalysis extends BackgroundAnalysisBase {
    constructor(console: ConsoleInterface) {
        super(console);

        const initialData: InitializationData = {
            rootDirectory: (global as any).__rootDirectory as string,
            cancellationFolderName: undefined,
            runner: undefined,
        };
        const worker = createWorker(initialData);
        this.setup(worker);
    }
}

export class BrowserBackgroundAnalysisRunner extends BackgroundAnalysisRunnerBase {
    constructor(initialData: InitializationData) {
        super(parentPort(), initialData);
    }
    createRealFileSystem(): FileSystem {
        return new TestFileSystem(false, {
            cwd: normalizeSlashes('/'),
        });
    }
    protected override createHost(): Host {
        return new NoAccessHost();
    }
    protected createImportResolver(fs: FileSystem, options: ConfigOptions, host: Host): ImportResolver {
        // A useful point to do lazy stub aquisition?
        return new ImportResolver(fs, options, host);
    }
}
