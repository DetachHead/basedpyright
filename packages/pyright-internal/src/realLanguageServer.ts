/*
 * server.ts
 *
 * Implements pyright language server.
 */

import {
    CancellationToken,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Command,
    Connection,
    ExecuteCommandParams,
    MessageType,
    ShowMessageNotification,
    WorkDoneProgressServerReporter,
} from 'vscode-languageserver';

import { AnalysisResults } from './analyzer/analysis';
import { CacheManager } from './analyzer/cacheManager';
import { ImportResolver } from './analyzer/importResolver';
import { isPythonBinary } from './analyzer/pythonPathUtils';
import { CommandController } from './commands/commandController';
import { ConfigOptions, SignatureDisplayType } from './common/configOptions';
import { ConsoleWithLogLevel, LogLevel, convertLogLevel } from './common/console';
import { isDefined, isString } from './common/core';
import { resolvePathWithEnvVariables } from './common/envVarUtils';
import { FileSystem, TempFile } from './common/fileSystem';
import { Host } from './common/host';
import { ServerSettings } from './common/languageServerInterface';
import { ProgressReporter } from './common/progressReporter';
import { ServiceProvider } from './common/serviceProvider';
import { createServiceProvider } from './common/serviceProviderExtensions';
import { Uri } from './common/uri/uri';
import { getRootUri } from './common/uri/uriUtils';
import { LanguageServerBase } from './languageServerBase';
import { CodeActionProvider } from './languageService/codeActionProvider';
import { PyrightFileSystem } from './pyrightFileSystem';
import { WellKnownWorkspaceKinds, Workspace } from './workspaceFactory';
import { toolName } from './constants';
import { CancellationProvider } from './common/cancellationUtils';
import { FileWatcherHandler } from './common/fileWatcher';
import version from './version.json';
import { PartialStubService } from './partialStubService';
import { Commands } from './commands/commands';

const maxAnalysisTimeInForeground = { openFilesTimeInMs: 50, noOpenFilesTimeInMs: 200 };

class ErrorNotificationConsole extends ConsoleWithLogLevel {
    constructor(private _connection: Connection) {
        super(_connection.console);
    }

    override error(message: string): void {
        this._connection.sendNotification(ShowMessageNotification.type, { message, type: MessageType.Error });
        super.error(message);
    }
}

//TODO: better name. this class is used by both the node and web language server, but not the test one
export abstract class RealLanguageServer extends LanguageServerBase {
    protected controller: CommandController;
    constructor(
        connection: Connection,
        maxWorkers: number,
        realFileSystem: FileSystem,
        cancellationProvider: CancellationProvider,
        tempFile: TempFile,
        fileWatcherProvider: FileWatcherHandler
    ) {
        const console = new ErrorNotificationConsole(connection);
        const pyrightFs = new PyrightFileSystem(realFileSystem);
        const cacheManager = new CacheManager(maxWorkers);
        const partialStubService = new PartialStubService(pyrightFs);

        const serviceProvider = createServiceProvider(
            pyrightFs,
            tempFile,
            console,
            cacheManager,
            partialStubService,
            cancellationProvider
        );

        // When executed from CLI command (pyright-langserver), __rootDirectory is
        // already defined. When executed from VSCode extension, rootDirectory should
        // be __dirname.
        const rootDirectory: Uri = getRootUri(serviceProvider) || Uri.file(__dirname, serviceProvider);
        const realPathRoot = pyrightFs.realCasePath(rootDirectory);

        super(
            {
                productName: toolName,
                rootDirectory: realPathRoot,
                version,
                serviceProvider,
                fileWatcherHandler: fileWatcherProvider,
                maxAnalysisTimeInForeground,
                supportedCodeActions: [CodeActionKind.QuickFix, CodeActionKind.SourceOrganizeImports],
                // TODO: all the other commands are registered in the vscode extension because they seem to have client side logic
                // for some reason
                supportedCommands: [Commands.createTypeStub, Commands.restartServer, Commands.writeBaseline],
            },
            connection
        );

        this.controller = new CommandController(this);
    }

    async getSettings(workspace: Workspace): Promise<ServerSettings> {
        const serverSettings: ServerSettings = {
            watchForSourceChanges: true,
            watchForLibraryChanges: true,
            watchForConfigChanges: true,
            openFilesOnly: true,
            useLibraryCodeForTypes: true,
            disableLanguageServices: false,
            disableTaggedHints: false,
            disableOrganizeImports: false,
            typeCheckingMode: 'recommended',
            diagnosticSeverityOverrides: {},
            logLevel: LogLevel.Info,
            autoImportCompletions: true,
            baselineFile: undefined,
            functionSignatureDisplay: SignatureDisplayType.formatted,
            inlayHints: {
                callArgumentNames: true,
                callArgumentNamesMatching: false,
                functionReturnTypes: true,
                variableTypes: true,
                genericTypes: false,
            },
            useTypingExtensions: false,
        };

        try {
            const workspaces = this.workspaceFactory.getNonDefaultWorkspaces(WellKnownWorkspaceKinds.Regular);

            const pythonSection = await this.getConfiguration(workspace.rootUri, 'python');
            if (pythonSection) {
                const pythonPath = pythonSection.pythonPath;
                if (pythonPath && isString(pythonPath) && !isPythonBinary(pythonPath)) {
                    serverSettings.pythonPath = resolvePathWithEnvVariables(workspace, pythonPath, workspaces);
                }

                const venvPath = pythonSection.venvPath;
                if (venvPath && isString(venvPath)) {
                    serverSettings.venvPath = resolvePathWithEnvVariables(workspace, venvPath, workspaces);
                }
            }

            const pythonAnalysisSection =
                (await this.getConfiguration(workspace.rootUri, 'basedpyright.analysis')) ||
                // this is undocumented, but we support the old section names for backwards compatibility with the pycharm pyright plugin
                (await this.getConfiguration(workspace.rootUri, 'python.analysis'));
            if (pythonAnalysisSection) {
                const typeshedPaths = pythonAnalysisSection.typeshedPaths;
                if (typeshedPaths && Array.isArray(typeshedPaths) && typeshedPaths.length > 0) {
                    const typeshedPath = typeshedPaths[0];
                    if (typeshedPath && isString(typeshedPath)) {
                        serverSettings.typeshedPath = resolvePathWithEnvVariables(workspace, typeshedPath, workspaces);
                    }
                }

                const stubPath = pythonAnalysisSection.stubPath;
                if (stubPath && isString(stubPath)) {
                    serverSettings.stubPath = resolvePathWithEnvVariables(workspace, stubPath, workspaces);
                }

                const baselineFile = pythonAnalysisSection.baselineFile;
                if (baselineFile && isString(baselineFile)) {
                    serverSettings.baselineFile = resolvePathWithEnvVariables(workspace, baselineFile, workspaces);
                }

                const diagnosticSeverityOverrides = pythonAnalysisSection.diagnosticSeverityOverrides;
                if (diagnosticSeverityOverrides) {
                    for (const [name, value] of Object.entries(diagnosticSeverityOverrides)) {
                        const ruleName = this.getDiagnosticRuleName(name);
                        const severity = this.getSeverityOverrides(value as string | boolean);
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

                serverSettings.logLevel = convertLogLevel(pythonAnalysisSection.logLevel);
                serverSettings.autoSearchPaths = !!pythonAnalysisSection.autoSearchPaths;

                const extraPaths = pythonAnalysisSection.extraPaths;
                if (extraPaths && Array.isArray(extraPaths) && extraPaths.length > 0) {
                    serverSettings.extraPaths = extraPaths
                        .filter((p) => p && isString(p))
                        .map((p) => resolvePathWithEnvVariables(workspace, p, workspaces))
                        .filter(isDefined);
                }

                serverSettings.includeFileSpecs = this._getStringValues(pythonAnalysisSection.include);
                serverSettings.excludeFileSpecs = this._getStringValues(pythonAnalysisSection.exclude);
                serverSettings.ignoreFileSpecs = this._getStringValues(pythonAnalysisSection.ignore);

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

                if (pythonAnalysisSection.fileEnumerationTimeout !== undefined) {
                    serverSettings.fileEnumerationTimeoutInSec = pythonAnalysisSection.fileEnumerationTimeout;
                }

                if (pythonAnalysisSection.autoFormatStrings !== undefined) {
                    serverSettings.autoFormatStrings = pythonAnalysisSection.autoFormatStrings;
                }

                const inlayHintSection = pythonAnalysisSection.inlayHints;
                if (inlayHintSection) {
                    serverSettings.inlayHints = { ...serverSettings.inlayHints, ...inlayHintSection };
                }
                if (pythonAnalysisSection.useTypingExtensions) {
                    serverSettings.useTypingExtensions = pythonAnalysisSection.useTypingExtensions;
                }
            } else {
                serverSettings.autoSearchPaths = true;
            }

            const pyrightSection =
                (await this.getConfiguration(workspace.rootUri, 'basedpyright')) ||
                // this is undocumented, but we support the old section names for backwards compatibility with the pycharm pyright plugin
                (await this.getConfiguration(workspace.rootUri, 'pyright'));
            if (pyrightSection) {
                if (pyrightSection.openFilesOnly !== undefined) {
                    serverSettings.openFilesOnly = !!pyrightSection.openFilesOnly;
                }

                if (pyrightSection.useLibraryCodeForTypes !== undefined) {
                    serverSettings.useLibraryCodeForTypes = !!pyrightSection.useLibraryCodeForTypes;
                }

                serverSettings.disableLanguageServices = !!pyrightSection.disableLanguageServices;
                serverSettings.disableTaggedHints = !!pyrightSection.disableTaggedHints;
                serverSettings.disableOrganizeImports = !!pyrightSection.disableOrganizeImports;

                const typeCheckingMode = pyrightSection.typeCheckingMode;
                if (typeCheckingMode && isString(typeCheckingMode)) {
                    serverSettings.typeCheckingMode = typeCheckingMode;
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : error;
            this.connection.sendNotification(ShowMessageNotification.type, {
                message: errorMessage,
                type: MessageType.Error,
            });
        }
        return serverSettings;
    }

    protected override createImportResolver(
        serviceProvider: ServiceProvider,
        options: ConfigOptions,
        host: Host
    ): ImportResolver {
        const importResolver = new ImportResolver(serviceProvider, options, host);

        // In case there was cached information in the file system related to
        // import resolution, invalidate it now.
        importResolver.invalidateCache();

        return importResolver;
    }

    protected executeCommand(params: ExecuteCommandParams, token: CancellationToken): Promise<any> {
        return this.controller.execute(params, token);
    }

    protected isLongRunningCommand(command: string): boolean {
        return this.controller.isLongRunningCommand(command);
    }

    protected isRefactoringCommand(command: string): boolean {
        return this.controller.isRefactoringCommand(command);
    }

    protected async executeCodeAction(
        params: CodeActionParams,
        token: CancellationToken
    ): Promise<(Command | CodeAction)[] | undefined | null> {
        this.recordUserInteractionTime();

        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        return CodeActionProvider.getCodeActionsForPosition(
            workspace,
            uri,
            params.range,
            params.context.only,
            token,
            this
        );
    }

    protected createProgressReporter(): ProgressReporter {
        // The old progress notifications are kept for backwards compatibility with
        // clients that do not support work done progress.
        let displayingProgress = false;
        let workDoneProgress: Promise<WorkDoneProgressServerReporter> | undefined;
        return {
            isDisplayingProgess: () => displayingProgress,
            isEnabled: (data: AnalysisResults) => true,
            begin: () => {
                displayingProgress = true;
                if (this.client.hasWindowProgressCapability) {
                    workDoneProgress = this.connection.window.createWorkDoneProgress();
                    workDoneProgress
                        .then((progress) => {
                            progress.begin('');
                        })
                        .ignoreErrors();
                } else {
                    this.connection.sendNotification('pyright/beginProgress');
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
                    this.connection.sendNotification('pyright/reportProgress', message);
                }
            },
            end: () => {
                displayingProgress = false;
                if (workDoneProgress) {
                    workDoneProgress
                        .then((progress) => {
                            progress.done();
                        })
                        .ignoreErrors();
                    workDoneProgress = undefined;
                } else {
                    this.connection.sendNotification('pyright/endProgress');
                }
            },
        };
    }

    private _getStringValues(values: any) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return [];
        }

        return values.filter((p) => p && isString(p)) as string[];
    }
}
