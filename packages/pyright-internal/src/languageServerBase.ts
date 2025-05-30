/*
 * languageServerBase.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Implements common language server functionality.
 * This is split out as a base class to allow for
 * different language server variants to be created
 * from the same core functionality.
 */

import './common/extensions';

import {
    AbstractCancellationTokenSource,
    CallHierarchyIncomingCallsParams,
    CallHierarchyItem,
    CallHierarchyOutgoingCall,
    CallHierarchyOutgoingCallsParams,
    CallHierarchyPrepareParams,
    CancellationToken,
    CodeAction,
    CodeActionParams,
    Command,
    CompletionItem,
    CompletionList,
    CompletionParams,
    CompletionTriggerKind,
    ConfigurationItem,
    Connection,
    Declaration,
    DeclarationLink,
    Definition,
    DefinitionLink,
    Diagnostic,
    DiagnosticRefreshRequest,
    DiagnosticRelatedInformation,
    DiagnosticSeverity,
    DiagnosticTag,
    DidChangeConfigurationParams,
    DidChangeTextDocumentParams,
    DidChangeWatchedFilesParams,
    DidCloseTextDocumentParams,
    DidOpenTextDocumentParams,
    Disposable,
    DocumentDiagnosticParams,
    DocumentDiagnosticReport,
    DocumentHighlight,
    DocumentHighlightParams,
    DocumentSymbol,
    DocumentSymbolParams,
    ExecuteCommandParams,
    HandlerResult,
    HoverParams,
    InitializeParams,
    InitializeResult,
    LSPObject,
    Location,
    MarkupKind,
    PrepareRenameParams,
    PublishDiagnosticsParams,
    ReferenceParams,
    RemoteWindow,
    RenameFilesParams,
    RenameParams,
    ResultProgressReporter,
    SignatureHelp,
    SignatureHelpParams,
    SymbolInformation,
    TextDocumentEdit,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    WorkDoneProgressReporter,
    WorkspaceDiagnosticParams,
    WorkspaceDocumentDiagnosticReport,
    WorkspaceEdit,
    WorkspaceFoldersChangeEvent,
    WorkspaceSymbol,
    WorkspaceSymbolParams,
} from 'vscode-languageserver';
import {
    DidChangeNotebookDocumentParams,
    DidCloseNotebookDocumentParams,
    DidOpenNotebookDocumentParams,
    DidSaveNotebookDocumentParams,
    InlayHint,
    InlayHintParams,
    SemanticTokens,
    SemanticTokensParams,
    WillSaveTextDocumentParams,
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { AnalysisResults } from './analyzer/analysis';
import { BackgroundAnalysisProgram, InvalidatedReason } from './analyzer/backgroundAnalysisProgram';
import { ImportResolver } from './analyzer/importResolver';
import { MaxAnalysisTime } from './analyzer/program';
import { AnalyzerService, LibraryReanalysisTimeProvider, getNextServiceId } from './analyzer/service';
import { IPythonMode, SourceFile } from './analyzer/sourceFile';
import type { IBackgroundAnalysis } from './backgroundAnalysisBase';
import { CommandResult } from './commands/commandResult';
import { CancelAfter } from './common/cancellationUtils';
import { CaseSensitivityDetector } from './common/caseSensitivityDetector';
import { getNestedProperty } from './common/collectionUtils';
import { DiagnosticSeverityOverrides, getDiagnosticSeverityOverrides } from './common/commandLineOptions';
import {
    ConfigOptions,
    deprecatedDiagnosticRules,
    getDiagLevelDiagnosticRules,
    parseDiagLevel,
    unreachableDiagnosticRules,
    unusedDiagnosticRules,
} from './common/configOptions';
import { ConsoleInterface, ConsoleWithLogLevel, LogLevel } from './common/console';
import { Diagnostic as AnalyzerDiagnostic, DiagnosticCategory } from './common/diagnostic';
import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { FileSystem, ReadOnlyFileSystem } from './common/fileSystem';
import { FileWatcherEventType } from './common/fileWatcher';
import { Host } from './common/host';
import {
    LanguageServerInterface,
    ServerOptions,
    ServerSettings,
    WorkspaceServices,
} from './common/languageServerInterface';
import { fromLSPAny, isNullProgressReporter } from './common/lspUtils';
import { ProgressReportTracker, ProgressReporter } from './common/progressReporter';
import { ServiceKeys } from './common/serviceKeys';
import { ServiceProvider } from './common/serviceProvider';
import { DocumentRange, Position, Range } from './common/textRange';
import { Uri } from './common/uri/uri';
import { AnalyzerServiceExecutor } from './languageService/analyzerServiceExecutor';
import { CallHierarchyProvider } from './languageService/callHierarchyProvider';
import { InlayHintsProvider } from './languageService/inlayHintsProvider';
import { CompletionItemData, CompletionMap, CompletionProvider } from './languageService/completionProvider';
import { DefinitionFilter, DefinitionProvider, TypeDefinitionProvider } from './languageService/definitionProvider';
import { DocumentHighlightProvider } from './languageService/documentHighlightProvider';
import { CollectionResult } from './languageService/documentSymbolCollector';
import { DocumentSymbolProvider } from './languageService/documentSymbolProvider';
import { DynamicFeature, DynamicFeatures } from './languageService/dynamicFeature';
import { FileWatcherDynamicFeature } from './languageService/fileWatcherDynamicFeature';
import { HoverProvider } from './languageService/hoverProvider';
import { canNavigateToFile } from './languageService/navigationUtils';
import { ReferencesProvider } from './languageService/referencesProvider';
import { RenameProvider } from './languageService/renameProvider';
import { SignatureHelpProvider } from './languageService/signatureHelpProvider';
import { WorkspaceSymbolProvider } from './languageService/workspaceSymbolProvider';
import { Localizer, setLocaleOverride } from './localization/localize';
import { ParseFileResults } from './parser/parser';
import { ClientCapabilities, InitializationOptions } from './types';
import { InitStatus, WellKnownWorkspaceKinds, Workspace, WorkspaceFactory } from './workspaceFactory';
import { website } from './constants';
import { SemanticTokensProvider, SemanticTokensProviderLegend } from './languageService/semanticTokensProvider';
import { RenameUsageFinder } from './analyzer/renameUsageFinder';
import { AutoImporter, buildModuleSymbolsMap } from './languageService/autoImporter';
import { zip } from 'lodash';
import { assert } from './common/debug';

const UncomputedDiagnosticsVersion = -1;

export abstract class LanguageServerBase implements LanguageServerInterface, Disposable {
    // We support running only one "find all reference" at a time.
    private _pendingFindAllRefsCancellationSource: AbstractCancellationTokenSource | undefined;

    // We support running only one command at a time.
    private _pendingCommandCancellationSource: AbstractCancellationTokenSource | undefined;

    private _progressReporter: ProgressReporter;
    private _progressReportCounter = 0;

    private _lastTriggerKind: CompletionTriggerKind | undefined = CompletionTriggerKind.Invoked;

    private _initialized = false;
    private _workspaceFoldersChangedDisposable: Disposable | undefined;

    protected client: ClientCapabilities = {
        hasConfigurationCapability: false,
        hasVisualStudioExtensionsCapability: false,
        hasWorkspaceFoldersCapability: false,
        hasWatchFileCapability: false,
        hasWatchFileRelativePathCapability: false,
        hasActiveParameterCapability: false,
        hasSignatureLabelOffsetCapability: false,
        hasHierarchicalDocumentSymbolCapability: false,
        hasWindowProgressCapability: false,
        hasGoToDeclarationCapability: false,
        hasDocumentChangeCapability: false,
        hasDocumentAnnotationCapability: false,
        hasCompletionCommitCharCapability: false,
        hoverContentFormat: MarkupKind.PlainText,
        completionDocFormat: MarkupKind.PlainText,
        completionSupportsSnippet: false,
        signatureDocFormat: MarkupKind.PlainText,
        supportsTaskItemDiagnosticTag: false,
        completionItemResolveSupportsAdditionalTextEdits: false,
        usingPullDiagnostics: false,
        requiresPullRelatedInformationCapability: false,
        completionItemResolveSupportsTags: false,
    };

    protected defaultClientConfig: any;

    protected readonly workspaceFactory: WorkspaceFactory;
    protected readonly openFileMap = new Map<string, TextDocument>();
    private readonly _openCells = new Map<string, readonly TextDocument[]>();
    protected readonly fs: FileSystem;
    protected readonly caseSensitiveDetector: CaseSensitivityDetector;

    protected readonly savedFilesForBaselineUpdate = new Set<string>();

    // The URIs for which diagnostics are reported
    readonly documentsWithDiagnostics: Record<string, FileDiagnostics> = {};

    protected readonly dynamicFeatures = new DynamicFeatures();

    constructor(protected serverOptions: ServerOptions, protected connection: Connection) {
        // Stash the base directory into a global variable.
        // This must happen before fs.getModulePath().
        (global as any).__rootDirectory = serverOptions.rootDirectory.getFilePath();

        this.console.info(
            `${serverOptions.productName} language server ${
                serverOptions.version && serverOptions.version + ' '
            }starting`
        );

        this.console.info(`Server root directory: ${serverOptions.rootDirectory}`);

        this.fs = this.serverOptions.serviceProvider.fs();
        this.caseSensitiveDetector = this.serverOptions.serviceProvider.get(ServiceKeys.caseSensitivityDetector);

        this.workspaceFactory = new WorkspaceFactory(
            this.console,
            this.createAnalyzerServiceForWorkspace.bind(this),
            this.onWorkspaceCreated.bind(this),
            this.onWorkspaceRemoved.bind(this),
            this.serviceProvider
        );

        // Set the working directory to a known location within
        // the extension directory. Otherwise the execution of
        // python can have unintended and surprising results.
        const moduleDirectory = this.fs.getModulePath();
        if (moduleDirectory && this.fs.existsSync(moduleDirectory)) {
            this.fs.chdir(moduleDirectory);
        }

        // Set up callbacks.
        this.setupConnection(serverOptions.supportedCommands ?? [], serverOptions.supportedCodeActions ?? []);

        this._progressReporter = new ProgressReportTracker(this.createProgressReporter());

        // Listen on the connection.
        this.connection.listen();
    }

    get console(): ConsoleInterface {
        return this.serverOptions.serviceProvider.console();
    }

    // Provides access to the client's window.
    get window(): RemoteWindow {
        return this.connection.window;
    }

    get supportAdvancedEdits(): boolean {
        return this.client.hasDocumentChangeCapability && this.client.hasDocumentAnnotationCapability;
    }

    get serviceProvider() {
        return this.serverOptions.serviceProvider;
    }

    dispose() {
        this.workspaceFactory.clear();
        this.openFileMap.clear();
        this._openCells.clear();
        this.dynamicFeatures.unregister();
        this._workspaceFoldersChangedDisposable?.dispose();
    }

    abstract createBackgroundAnalysis(serviceId: string, workspaceRoot: Uri): IBackgroundAnalysis | undefined;

    abstract getSettings(workspace: Workspace): Promise<ServerSettings>;

    // Creates a service instance that's used for analyzing a
    // program within a workspace.
    createAnalyzerService(
        name: string,
        workspaceRoot: Uri,
        services?: WorkspaceServices,
        libraryReanalysisTimeProvider?: LibraryReanalysisTimeProvider
    ): AnalyzerService {
        this.console.info(`Starting service instance "${name}"`);

        const serviceId = getNextServiceId(name);
        const service = new AnalyzerService(name, this.serverOptions.serviceProvider, {
            console: this.console,
            hostFactory: this.createHost.bind(this),
            importResolverFactory: this.createImportResolver.bind(this),
            backgroundAnalysis: services
                ? services.backgroundAnalysis
                : this.createBackgroundAnalysis(serviceId, workspaceRoot),
            maxAnalysisTime: this.serverOptions.maxAnalysisTimeInForeground,
            backgroundAnalysisProgramFactory: this.createBackgroundAnalysisProgram.bind(this),
            libraryReanalysisTimeProvider,
            serviceId,
            fileSystem: services?.fs ?? this.serverOptions.serviceProvider.fs(),
            usingPullDiagnostics: this.client.usingPullDiagnostics,
            onInvalidated: (reason) => {
                if (this.client.usingPullDiagnostics) {
                    this.connection.sendRequest(DiagnosticRefreshRequest.type);
                }
            },
        });

        service.setCompletionCallback((results) => this.onAnalysisCompletedHandler(service.fs, results));
        return service;
    }

    async getWorkspaces(): Promise<Workspace[]> {
        const workspaces = this.workspaceFactory.items();
        for (const workspace of workspaces) {
            await workspace.isInitialized.promise;
        }

        return workspaces;
    }

    async getWorkspaceForFile(fileUri: Uri, pythonPath?: Uri): Promise<Workspace> {
        return this.workspaceFactory.getWorkspaceForFile(fileUri, pythonPath);
    }

    async getContainingWorkspacesForFile(fileUri: Uri): Promise<Workspace[]> {
        return this.workspaceFactory.getContainingWorkspacesForFile(fileUri);
    }

    reanalyze() {
        this.workspaceFactory.items().forEach((workspace) => {
            workspace.service.invalidateAndForceReanalysis(InvalidatedReason.Reanalyzed);
        });
    }

    restart() {
        this.workspaceFactory.items().forEach((workspace) => {
            workspace.service.restart();
        });
    }

    updateSettingsForAllWorkspaces(): void {
        const tasks: Promise<void>[] = [];
        this.workspaceFactory.items().forEach((workspace) => {
            // Updating settings can change workspace's file ownership. Make workspace uninitialized so that
            // features can wait until workspace gets new settings.
            // the file's ownership can also changed by `pyrightconfig.json` changes, but those are synchronous
            // operation, so it won't affect this.
            workspace.isInitialized = workspace.isInitialized.reset();
            tasks.push(this.updateSettingsForWorkspace(workspace, workspace.isInitialized));
        });

        Promise.all(tasks).then(() => {
            this.dynamicFeatures.register();
        });
    }

    async updateSettingsForWorkspace(
        workspace: Workspace,
        status: InitStatus | undefined,
        serverSettings?: ServerSettings
    ): Promise<void> {
        try {
            status?.markCalled();

            serverSettings = serverSettings ?? (await this.getSettings(workspace));

            // Set logging level first.
            (this.console as ConsoleWithLogLevel).level = serverSettings.logLevel ?? LogLevel.Info;

            this.dynamicFeatures.update(serverSettings);

            // Then use the updated settings to restart the service.
            this.updateOptionsAndRestartService(workspace, serverSettings);

            workspace.disableLanguageServices = !!serverSettings.disableLanguageServices;
            workspace.disableTaggedHints = !!serverSettings.disableTaggedHints;
            workspace.disableOrganizeImports = !!serverSettings.disableOrganizeImports;
            workspace.inlayHints = serverSettings.inlayHints;
            workspace.useTypingExtensions = serverSettings.useTypingExtensions ?? false;
            workspace.fileEnumerationTimeoutInSec = serverSettings.fileEnumerationTimeoutInSec ?? 10;
        } finally {
            // Don't use workspace.isInitialized directly since it might have been
            // reset due to pending config change event.
            // The workspace is now open for business.
            status?.resolve();
        }
    }

    updateOptionsAndRestartService(
        workspace: Workspace,
        serverSettings: ServerSettings,
        typeStubTargetImportName?: string
    ) {
        AnalyzerServiceExecutor.runWithOptions(workspace, serverSettings, { typeStubTargetImportName });
        workspace.searchPathsToWatch = workspace.service.librarySearchUrisToWatch ?? [];
    }

    convertUriToLspUriString = (fs: ReadOnlyFileSystem, uri: Uri): string => {
        // Convert to a URI string that the LSP client understands (mapped files are only local to the server).
        if (this._isNotebookUri(uri)) {
            // if it's a notebook cell we need to figure out the open uri matching the index, because it changes
            // when cells are rearranged
            const result = this._convertUriToLspNotebookCellUri(uri);
            // result can be undefined if the cell has been deleted and running in background analysis mode which
            // causes this._openCells to get cleared before this method is called, in which case fall back to the
            // normal uri
            if (result) {
                return result.uri;
            }
        }
        return fs.getOriginalUri(uri).toString();
    };

    protected abstract executeCommand(params: ExecuteCommandParams, token: CancellationToken): Promise<any>;

    protected abstract isLongRunningCommand(command: string): boolean;
    protected abstract isRefactoringCommand(command: string): boolean;

    protected abstract executeCodeAction(
        params: CodeActionParams,
        token: CancellationToken
    ): Promise<(Command | CodeAction)[] | undefined | null>;

    protected async getConfiguration(scopeUri: Uri | undefined, section: string) {
        if (this.client.hasConfigurationCapability) {
            const item: ConfigurationItem = {};
            if (scopeUri !== undefined) {
                item.scopeUri = scopeUri.toString();
            }
            if (section !== undefined) {
                item.section = section;
            }
            return this.connection.workspace.getConfiguration(item);
        }

        if (this.defaultClientConfig) {
            return getNestedProperty(this.defaultClientConfig, section);
        }

        return undefined;
    }

    protected isOpenFilesOnly(diagnosticMode: string): boolean {
        if (diagnosticMode === 'openFilesOnly') {
            return true;
        }
        if (diagnosticMode === 'workspace') {
            return false;
        }
        throw new Error(
            `invalid diagnosticMode: "${diagnosticMode}". valid options are "workspace" or "openFilesOnly"`
        );
    }

    protected getSeverityOverrides(value: string | boolean): DiagnosticSeverityOverrides | undefined {
        const enumValue = parseDiagLevel(value);
        // TODO: this allows additional diagnostic severity levels (unreachable, unused & deprecated) on all rules
        // in the lsp config. it should use the same logic as ConfigOptions._convertDiagnosticLevel instead
        if (!enumValue) {
            return undefined;
        }
        if (getDiagnosticSeverityOverrides().includes(enumValue)) {
            return enumValue;
        }

        return undefined;
    }

    protected getDiagnosticRuleName(value: string): DiagnosticRule | undefined {
        const enumValue = value as DiagnosticRule;
        if (getDiagLevelDiagnosticRules().includes(enumValue)) {
            return enumValue;
        }

        return undefined;
    }

    protected abstract createHost(): Host;
    protected abstract createImportResolver(
        serviceProvider: ServiceProvider,
        options: ConfigOptions,
        host: Host
    ): ImportResolver;

    protected createBackgroundAnalysisProgram(
        serviceId: string,
        serviceProvider: ServiceProvider,
        configOptions: ConfigOptions,
        importResolver: ImportResolver,
        backgroundAnalysis?: IBackgroundAnalysis,
        maxAnalysisTime?: MaxAnalysisTime
    ): BackgroundAnalysisProgram {
        return new BackgroundAnalysisProgram(
            serviceId,
            serviceProvider,
            configOptions,
            importResolver,
            backgroundAnalysis,
            maxAnalysisTime,
            /* disableChecker */ undefined
        );
    }

    protected setupConnection(supportedCommands: string[], supportedCodeActions: string[]): void {
        // After the server has started the client sends an initialize request. The server receives
        // in the passed params the rootPath of the workspace plus the client capabilities.
        this.connection.onInitialize((params) => this.initialize(params, supportedCommands, supportedCodeActions));

        this.connection.onInitialized(() => this.onInitialized());

        this.connection.onDidChangeConfiguration((params) => this.onDidChangeConfiguration(params));

        this.connection.onCodeAction((params, token) => this.executeCodeAction(params, token));

        this.connection.onDefinition(async (params, token) => this.onDefinition(params, token));
        this.connection.onDeclaration(async (params, token) => this.onDeclaration(params, token));
        this.connection.onTypeDefinition(async (params, token) => this.onTypeDefinition(params, token));

        this.connection.onReferences(async (params, token, workDoneReporter, resultReporter) =>
            this.onReferences(params, token, workDoneReporter, resultReporter)
        );

        this.connection.onDocumentSymbol(async (params, token) => this.onDocumentSymbol(params, token));
        this.connection.onWorkspaceSymbol(async (params, token, _, resultReporter) =>
            this.onWorkspaceSymbol(params, token, resultReporter)
        );

        this.connection.onHover(async (params, token) => this.onHover(params, token));

        this.connection.onDocumentHighlight(async (params, token) => this.onDocumentHighlight(params, token));

        this.connection.onSignatureHelp(async (params, token) => this.onSignatureHelp(params, token));

        this.connection.onCompletion((params, token) => this.onCompletion(params, token));
        this.connection.onCompletionResolve(async (params, token) => this.onCompletionResolve(params, token));

        this.connection.onPrepareRename(async (params, token) => this.onPrepareRenameRequest(params, token));
        this.connection.onRenameRequest(async (params, token) => this.onRenameRequest(params, token));

        const callHierarchy = this.connection.languages.callHierarchy;
        callHierarchy.onPrepare(async (params, token) => this.onCallHierarchyPrepare(params, token));
        callHierarchy.onIncomingCalls(async (params, token) => this.onCallHierarchyIncomingCalls(params, token));
        callHierarchy.onOutgoingCalls(async (params, token) => this.onCallHierarchyOutgoingCalls(params, token));

        const inlayHints = this.connection.languages.inlayHint;
        inlayHints.on(async (params, token) => this.onInlayHints(params, token));

        const semanticTokens = this.connection.languages.semanticTokens;
        semanticTokens.on(async (params, token) => this.onSemanticTokens(params, token));

        this.connection.onDidOpenTextDocument(async (params) => this.onDidOpenTextDocument(params));
        this.connection.onDidChangeTextDocument(async (params) => this.onDidChangeTextDocument(params));
        this.connection.onDidCloseTextDocument(async (params) => this.onDidCloseTextDocument(params));
        this.connection.notebooks.synchronization.onDidOpenNotebookDocument(this.onDidOpenNotebookDocument);
        this.connection.notebooks.synchronization.onDidChangeNotebookDocument(this.onDidChangeNotebookDocument);
        this.connection.notebooks.synchronization.onDidCloseNotebookDocument(this.onDidCloseNotebookDocument);
        // this is incosnsitent because non-notebook files use onWillSaveTextDocument instead of onDidSaveTextDocument.
        // see https://github.com/microsoft/language-server-protocol/issues/2095 i don't think it will casue any issues,
        // but it just takes slightly longer to determine that it needs to update the baseline file i think
        this.connection.notebooks.synchronization.onDidSaveNotebookDocument(this.onSaveNotebookDocument);
        this.connection.onDidChangeWatchedFiles((params) => this.onDidChangeWatchedFiles(params));
        this.connection.workspace.onWillRenameFiles(this.onRenameFiles);
        this.connection.onWillSaveTextDocument(this.onSaveTextDocument);

        this.connection.languages.diagnostics.on(async (params, token) => this.onDiagnostics(params, token));
        this.connection.languages.diagnostics.onWorkspace(async (params, token) =>
            this.onWorkspaceDiagnostics(params, token)
        );
        this.connection.onExecuteCommand(async (params, token, reporter) =>
            this.onExecuteCommand(params, token, reporter)
        );
        this.connection.onShutdown(async (token) => this.onShutdown(token));
    }

    protected async initialize(
        params: InitializeParams,
        supportedCommands: string[],
        supportedCodeActions: string[]
    ): Promise<InitializeResult> {
        if (params.locale) {
            setLocaleOverride(params.locale);
        }

        const initializationOptions = (params.initializationOptions ?? {}) as LSPObject & InitializationOptions;
        const capabilities = params.capabilities;
        this.client.hasConfigurationCapability = !!capabilities.workspace?.configuration;
        this.client.hasWatchFileCapability = !!capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration;
        this.client.hasWatchFileRelativePathCapability =
            !!capabilities.workspace?.didChangeWatchedFiles?.relativePatternSupport;
        this.client.hasWorkspaceFoldersCapability = !!capabilities.workspace?.workspaceFolders;
        this.client.hasVisualStudioExtensionsCapability = !!(capabilities as any)._vs_supportsVisualStudioExtensions;
        this.client.hasActiveParameterCapability =
            !!capabilities.textDocument?.signatureHelp?.signatureInformation?.activeParameterSupport;
        this.client.hasSignatureLabelOffsetCapability =
            !!capabilities.textDocument?.signatureHelp?.signatureInformation?.parameterInformation?.labelOffsetSupport;
        this.client.hasHierarchicalDocumentSymbolCapability =
            !!capabilities.textDocument?.documentSymbol?.hierarchicalDocumentSymbolSupport;
        this.client.hasDocumentChangeCapability =
            !!capabilities.workspace?.workspaceEdit?.documentChanges &&
            !!capabilities.workspace.workspaceEdit?.resourceOperations;
        this.client.hasDocumentAnnotationCapability = !!capabilities.workspace?.workspaceEdit?.changeAnnotationSupport;
        this.client.hasCompletionCommitCharCapability =
            !!capabilities.textDocument?.completion?.completionList?.itemDefaults &&
            !!capabilities.textDocument.completion.completionItem?.commitCharactersSupport;

        this.client.hoverContentFormat = this._getCompatibleMarkupKind(capabilities.textDocument?.hover?.contentFormat);
        this.client.completionDocFormat = this._getCompatibleMarkupKind(
            capabilities.textDocument?.completion?.completionItem?.documentationFormat
        );
        this.client.completionSupportsSnippet = !!capabilities.textDocument?.completion?.completionItem?.snippetSupport;
        this.client.signatureDocFormat = this._getCompatibleMarkupKind(
            capabilities.textDocument?.signatureHelp?.signatureInformation?.documentationFormat
        );
        // if the client is running in VS, it always supports task item diagnostics
        this.client.supportsTaskItemDiagnosticTag = this.client.hasVisualStudioExtensionsCapability;
        this.client.hasWindowProgressCapability = !!capabilities.window?.workDoneProgress;
        this.client.hasGoToDeclarationCapability = !!capabilities.textDocument?.declaration;
        const completionResolveProperties =
            capabilities.textDocument?.completion?.completionItem?.resolveSupport?.properties ?? [];
        this.client.completionItemResolveSupportsAdditionalTextEdits =
            completionResolveProperties.includes('additionalTextEdits');
        this.client.completionItemResolveSupportsTags = completionResolveProperties.includes('tags');
        this.client.usingPullDiagnostics =
            !!capabilities.textDocument?.diagnostic?.dynamicRegistration &&
            initializationOptions?.diagnosticMode !== 'workspace' &&
            initializationOptions?.disablePullDiagnostics !== true;
        this.client.requiresPullRelatedInformationCapability =
            !!capabilities.textDocument?.diagnostic?.relatedInformation &&
            initializationOptions?.diagnosticMode !== 'workspace' &&
            initializationOptions?.disablePullDiagnostics !== true;

        // Create a service instance for each of the workspace folders.
        this.workspaceFactory.handleInitialize(params);

        if (this.client.hasWatchFileCapability) {
            this.addDynamicFeature(
                new FileWatcherDynamicFeature(
                    this.connection,
                    this.client.hasWatchFileRelativePathCapability,
                    this.fs,
                    this.workspaceFactory
                )
            );
        }
        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: { willSave: true, change: TextDocumentSyncKind.Incremental, openClose: true },
                notebookDocumentSync: {
                    notebookSelector: [
                        {
                            notebook: { scheme: 'file', notebookType: 'jupyter-notebook' },
                            cells: [{ language: 'python' }],
                        },
                    ],
                    save: true,
                },
                definitionProvider: { workDoneProgress: true },
                declarationProvider: { workDoneProgress: true },
                typeDefinitionProvider: { workDoneProgress: true },
                referencesProvider: { workDoneProgress: true },
                documentSymbolProvider: { workDoneProgress: true },
                workspaceSymbolProvider: { workDoneProgress: true },
                hoverProvider: { workDoneProgress: true },
                documentHighlightProvider: { workDoneProgress: true },
                renameProvider: { prepareProvider: true, workDoneProgress: true },
                completionProvider: {
                    triggerCharacters: this.client.hasVisualStudioExtensionsCapability
                        ? ['.', '[', '@', '"', "'"]
                        : ['.', '[', '"', "'"],
                    resolveProvider: true,
                    workDoneProgress: true,
                    completionItem: {
                        labelDetailsSupport: true,
                    },
                },
                signatureHelpProvider: {
                    triggerCharacters: ['(', ',', ')'],
                    workDoneProgress: true,
                },
                codeActionProvider: {
                    codeActionKinds: supportedCodeActions,
                    workDoneProgress: true,
                },
                executeCommandProvider: {
                    commands: supportedCommands,
                    workDoneProgress: true,
                },
                callHierarchyProvider: true,
                inlayHintProvider: true,
                semanticTokensProvider: {
                    legend: SemanticTokensProviderLegend,
                    full: true,
                },
                workspace: {
                    fileOperations: { willRename: { filters: [{ pattern: { glob: '**/*' } }] } },
                    workspaceFolders: {
                        supported: true,
                        changeNotifications: true,
                    },
                },
            },
            serverInfo: {
                name: 'basedpyright',
                version: this.serverOptions.version,
            },
        };

        if (this.client.usingPullDiagnostics) {
            result.capabilities.diagnosticProvider = {
                identifier: 'pyright',
                documentSelector: null,
                interFileDependencies: true,
                workspaceDiagnostics: false, // Workspace wide are not pull diagnostics.
            };
        }

        return result;
    }

    protected onInitialized() {
        this.handleInitialized((event) => {
            this.workspaceFactory.handleWorkspaceFoldersChanged(event, null);
            this.dynamicFeatures.register();
        });
    }

    protected handleInitialized(changeWorkspaceFolderHandler: (e: WorkspaceFoldersChangeEvent) => any) {
        // Mark as initialized. We need this to make sure to
        // not send config updates before this point.
        this._initialized = true;

        if (!this.client.hasWorkspaceFoldersCapability) {
            // If folder capability is not supported, initialize ones given by onInitialize.
            this.updateSettingsForAllWorkspaces();
            return;
        }

        this._workspaceFoldersChangedDisposable =
            this.connection.workspace.onDidChangeWorkspaceFolders(changeWorkspaceFolderHandler);

        this.dynamicFeatures.register();
    }

    protected onDidChangeConfiguration(params: DidChangeConfigurationParams) {
        this.console.log(`Received updated settings`);
        if (params?.settings) {
            this.defaultClientConfig = params?.settings;
        }
        this.updateSettingsForAllWorkspaces();
    }

    protected async onDefinition(
        params: TextDocumentPositionParams,
        token: CancellationToken
    ): Promise<Definition | DefinitionLink[] | undefined | null> {
        return this.getDefinitions(
            params,
            token,
            this.client.hasGoToDeclarationCapability ? DefinitionFilter.PreferSource : DefinitionFilter.All,
            (workspace, filePath, position, filter, token) =>
                workspace.service.run((program) => {
                    return new DefinitionProvider(program, filePath, position, filter, token).getDefinitions();
                }, token)
        );
    }

    protected async onDeclaration(
        params: TextDocumentPositionParams,
        token: CancellationToken
    ): Promise<Declaration | DeclarationLink[] | undefined | null> {
        return this.getDefinitions(
            params,
            token,
            this.client.hasGoToDeclarationCapability ? DefinitionFilter.PreferStubs : DefinitionFilter.All,
            (workspace, filePath, position, filter, token) =>
                workspace.service.run((program) => {
                    return new DefinitionProvider(program, filePath, position, filter, token).getDefinitions();
                }, token)
        );
    }

    protected async onTypeDefinition(
        params: TextDocumentPositionParams,
        token: CancellationToken
    ): Promise<Definition | DefinitionLink[] | undefined | null> {
        return this.getDefinitions(params, token, DefinitionFilter.All, (workspace, filePath, position, _, token) =>
            workspace.service.run((program) => {
                return new TypeDefinitionProvider(program, filePath, position, token).getDefinitions();
            }, token)
        );
    }

    protected async getDefinitions(
        params: TextDocumentPositionParams,
        token: CancellationToken,
        filter: DefinitionFilter,
        getDefinitionsFunc: (
            workspace: Workspace,
            fileUri: Uri,
            position: Position,
            filter: DefinitionFilter,
            token: CancellationToken
        ) => DocumentRange[] | undefined
    ) {
        this.recordUserInteractionTime();

        const uri = this.convertLspUriStringToUri(params.textDocument.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return undefined;
        }

        const locations = getDefinitionsFunc(workspace, uri, params.position, filter, token);
        if (!locations) {
            return undefined;
        }
        return locations
            .filter((loc) => this.canNavigateToFile(loc.uri, workspace.service.fs))
            .map((loc) => Location.create(this.convertUriToLspUriString(workspace.service.fs, loc.uri), loc.range));
    }

    protected async onReferences(
        params: ReferenceParams,
        token: CancellationToken,
        workDoneReporter: WorkDoneProgressReporter,
        resultReporter: ResultProgressReporter<Location[]> | undefined,
        createDocumentRange?: (uri: Uri, result: CollectionResult, parseResults: ParseFileResults) => DocumentRange,
        convertToLocation?: (
            ls: LanguageServerInterface,
            fs: ReadOnlyFileSystem,
            ranges: DocumentRange
        ) => Location | undefined
    ): Promise<Location[] | null | undefined> {
        if (this._pendingFindAllRefsCancellationSource) {
            this._pendingFindAllRefsCancellationSource.cancel();
            this._pendingFindAllRefsCancellationSource = undefined;
        }

        // VS Code doesn't support cancellation of "find all references".
        // We provide a progress bar a cancellation button so the user can cancel
        // any long-running actions.
        const progress = await this.getProgressReporter(
            workDoneReporter,
            Localizer.CodeAction.findingReferences(),
            token
        );

        const source = progress.source;
        this._pendingFindAllRefsCancellationSource = source;

        try {
            const uri = this.convertLspUriStringToUri(params.textDocument.uri);

            const workspace = await this.getWorkspaceForFile(uri);
            if (workspace.disableLanguageServices) {
                return;
            }

            return workspace.service.run((program) => {
                return new ReferencesProvider(
                    this,
                    program,
                    source.token,
                    createDocumentRange,
                    convertToLocation
                ).reportReferences(uri, params.position, params.context.includeDeclaration, resultReporter);
            }, token);
        } finally {
            progress.reporter.done();
            source.dispose();
        }
    }

    protected async onDocumentSymbol(
        params: DocumentSymbolParams,
        token: CancellationToken
    ): Promise<DocumentSymbol[] | SymbolInformation[] | null | undefined> {
        this.recordUserInteractionTime();

        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return undefined;
        }

        return workspace.service.run((program) => {
            return new DocumentSymbolProvider(
                program,
                uri,
                this.client.hasHierarchicalDocumentSymbolCapability,
                { includeAliases: false },
                token,
                this
            ).getSymbols();
        }, token);
    }

    protected onWorkspaceSymbol(
        params: WorkspaceSymbolParams,
        token: CancellationToken,
        resultReporter: ResultProgressReporter<SymbolInformation[]> | undefined
    ): Promise<SymbolInformation[] | WorkspaceSymbol[] | null | undefined> {
        const result = new WorkspaceSymbolProvider(
            this.workspaceFactory.items(),
            resultReporter,
            params.query,
            token,
            this
        ).reportSymbols();

        return Promise.resolve(result);
    }

    protected async onHover(params: HoverParams, token: CancellationToken) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return undefined;
        }

        return workspace.service.run((program) => {
            return new HoverProvider(program, uri, params.position, this.client.hoverContentFormat, token).getHover();
        }, token);
    }

    protected async onDocumentHighlight(
        params: DocumentHighlightParams,
        token: CancellationToken
    ): Promise<DocumentHighlight[] | null | undefined> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);

        return workspace.service.run((program) => {
            return new DocumentHighlightProvider(program, uri, params.position, token).getDocumentHighlight();
        }, token);
    }

    protected async onSignatureHelp(
        params: SignatureHelpParams,
        token: CancellationToken
    ): Promise<SignatureHelp | undefined | null> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return;
        }

        return workspace.service.run((program) => {
            return new SignatureHelpProvider(
                program,
                uri,
                params.position,
                this.client.signatureDocFormat,
                this.client.hasSignatureLabelOffsetCapability,
                this.client.hasActiveParameterCapability,
                params.context,
                program.serviceProvider.docStringService(),
                token
            ).getSignatureHelp();
        }, token);
    }

    protected setCompletionIncomplete(params: CompletionParams, completions: CompletionList | null) {
        // We set completion incomplete for the first invocation and next consecutive call,
        // but after that we mark it as completed so the client doesn't repeatedly call back.
        // We mark the first one as incomplete because completion could be invoked without
        // any meaningful character provided, such as an explicit completion invocation (ctrl+space)
        // or a period. That might cause us to not include some items (e.g., auto-imports).
        // The next consecutive call provides some characters to help us to pick
        // better completion items. After that, we are not going to introduce new items,
        // so we can let the client to do the filtering and caching.
        const completionIncomplete =
            this._lastTriggerKind !== CompletionTriggerKind.TriggerForIncompleteCompletions ||
            params.context?.triggerKind !== CompletionTriggerKind.TriggerForIncompleteCompletions;

        this._lastTriggerKind = params.context?.triggerKind;

        if (completions) {
            completions.isIncomplete = completionIncomplete;
        }
    }

    protected async onCompletion(params: CompletionParams, token: CancellationToken): Promise<CompletionList | null> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            const completions = new CompletionProvider(
                program,
                uri,
                params.position,
                {
                    format: this.client.completionDocFormat,
                    snippet: this.client.completionSupportsSnippet,
                    lazyEdit: false,
                    triggerCharacter: params?.context?.triggerCharacter,
                    checkDeprecatedWhenResolving: this.client.completionItemResolveSupportsTags,
                    useTypingExtensions: workspace.useTypingExtensions,
                },
                token,
                false
            ).getCompletions();

            this.setCompletionIncomplete(params, completions);
            return completions;
        }, token);
    }

    // Cancellation bugs in vscode and LSP:
    // https://github.com/microsoft/vscode-languageserver-node/issues/615
    // https://github.com/microsoft/vscode/issues/95485
    //
    // If resolver throws cancellation exception, LSP and VSCode
    // cache that result and never call us back.
    protected async onCompletionResolve(params: CompletionItem, token: CancellationToken): Promise<CompletionItem> {
        const completionItemData = fromLSPAny<CompletionItemData>(params.data);
        if (completionItemData && completionItemData.uri) {
            const uri = Uri.parse(completionItemData.uri, this.caseSensitiveDetector);
            const workspace = await this.getWorkspaceForFile(uri);
            workspace.service.run((program) => {
                return new CompletionProvider(
                    program,
                    uri,
                    completionItemData.position,
                    {
                        format: this.client.completionDocFormat,
                        snippet: this.client.completionSupportsSnippet,
                        lazyEdit: false,
                        checkDeprecatedWhenResolving: this.client.completionItemResolveSupportsTags,
                        useTypingExtensions: workspace.useTypingExtensions,
                    },
                    token,
                    false
                ).resolveCompletionItem(params);
            }, token);
        }
        return params;
    }

    protected async onPrepareRenameRequest(
        params: PrepareRenameParams,
        token: CancellationToken
    ): Promise<Range | { range: Range; placeholder: string } | null> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const isUntitled = uri.isUntitled();

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            return new RenameProvider(program, uri, params.position, token, this).canRenameSymbol(
                workspace.kinds.includes(WellKnownWorkspaceKinds.Default),
                isUntitled
            );
        }, token);
    }

    protected async onRenameRequest(
        params: RenameParams,
        token: CancellationToken
    ): Promise<WorkspaceEdit | null | undefined> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const isUntitled = uri.isUntitled();

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return;
        }

        return workspace.service.run((program) => {
            return new RenameProvider(program, uri, params.position, token, this).renameSymbol(
                params.newName,
                workspace.kinds.includes(WellKnownWorkspaceKinds.Default),
                isUntitled
            );
        }, token);
    }

    protected async onInlayHints(params: InlayHintParams, token: CancellationToken): Promise<InlayHint[] | null> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        if (
            workspace.disableLanguageServices ||
            // don't bother creating the inlay hint provider if all the inlay hint settings are off
            (workspace.inlayHints && !Object.values(workspace.inlayHints).some((value) => value))
        ) {
            return null;
        }
        return workspace.service.run((program) => {
            const currentFile = program.getSourceFileInfo(uri);
            const moduleSymbolMap = buildModuleSymbolsMap(
                program.getSourceFileInfoList().filter((s) => s !== currentFile)
            );

            const parseFileResults = program.getParseResults(uri);
            const autoImporter = parseFileResults
                ? new AutoImporter(
                      program,
                      program.configOptions.findExecEnvironment(uri),
                      parseFileResults,
                      params.range.start,
                      new CompletionMap(),
                      moduleSymbolMap,
                      {}
                  )
                : undefined;
            return new InlayHintsProvider(program, uri, autoImporter, params.range, {
                callArgumentNames: workspace.inlayHints?.callArgumentNames ?? true,
                functionReturnTypes: workspace.inlayHints?.functionReturnTypes ?? true,
                variableTypes: workspace.inlayHints?.variableTypes ?? true,
                genericTypes: workspace.inlayHints?.genericTypes ?? false,
            }).onInlayHints();
        }, token);
    }

    protected async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return {
                resultId: undefined,
                data: [],
            };
        }
        return workspace.service.run((program) => {
            return new SemanticTokensProvider(program, uri, token).onSemanticTokens();
        }, token);
    }

    protected async onCallHierarchyPrepare(
        params: CallHierarchyPrepareParams,
        token: CancellationToken
    ): Promise<CallHierarchyItem[] | null> {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            return new CallHierarchyProvider(program, uri, params.position, token, this).onPrepare();
        }, token);
    }

    protected async onCallHierarchyIncomingCalls(params: CallHierarchyIncomingCallsParams, token: CancellationToken) {
        const uri = this.convertLspUriStringToUri(params.item.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            return new CallHierarchyProvider(program, uri, params.item.range.start, token, this).getIncomingCalls();
        }, token);
    }

    protected async onCallHierarchyOutgoingCalls(
        params: CallHierarchyOutgoingCallsParams,
        token: CancellationToken
    ): Promise<CallHierarchyOutgoingCall[] | null> {
        const uri = this.convertLspUriStringToUri(params.item.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            return new CallHierarchyProvider(program, uri, params.item.range.start, token, this).getOutgoingCalls();
        }, token);
    }

    protected async onDidOpenTextDocument(params: DidOpenTextDocumentParams) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        let doc = this.openFileMap.get(uri.key);
        if (doc) {
            // We shouldn't get an open text document request for an already-opened doc.
            const message = `Received redundant open text document command for ${uri}`;
            // for some reason if a new notebook is opened that doesn't yet exist on disk (eg. when running "Create: New Jupyter Notebook"),
            // didClose never gets called if it's closed without being saved. this might be a bug in vscode's lsp client but idk, so we warn
            // instead of error so it doesn't show up to the user
            if (uri.scheme === 'vscode-notebook-cell') {
                this.console.warn(message);
            } else {
                this.console.error(message);
            }
            TextDocument.update(doc, [{ text: params.textDocument.text }], params.textDocument.version);
        } else {
            doc = TextDocument.create(
                params.textDocument.uri,
                'python',
                params.textDocument.version,
                params.textDocument.text
            );
        }
        this.openFileMap.set(uri.key, doc);

        // Send this open to all the workspaces that might contain this file.
        const workspaces = await this.getContainingWorkspacesForFile(uri);
        workspaces.forEach((w) => {
            w.service.setFileOpened(uri, params.textDocument.version, params.textDocument.text);
        });
    }

    protected onDidOpenNotebookDocument = async (params: DidOpenNotebookDocumentParams) => {
        const uri = this.convertLspUriStringToUri(params.notebookDocument.uri);
        const openCells: TextDocument[] = [];
        this._openCells.set(uri.key, openCells);
        await Promise.all(
            params.cellTextDocuments.map(async (textDocument, index) => {
                const cellUri = this.convertLspUriStringToUri(textDocument.uri, index);
                const doc = TextDocument.create(textDocument.uri, 'python', textDocument.version, textDocument.text);
                openCells.push(doc);
                // Send this open to all the workspaces that might contain this file.
                const workspaces = await this.getContainingWorkspacesForFile(cellUri);
                workspaces.forEach((w) => {
                    w.service.setFileOpened(
                        cellUri,
                        textDocument.version,
                        textDocument.text,
                        IPythonMode.CellDocs,
                        this._getChainedFileUri(textDocument, index)
                    );
                });
            })
        );
    };

    protected async onDidChangeTextDocument(params: DidChangeTextDocumentParams) {
        this.recordUserInteractionTime();

        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const doc = this.openFileMap.get(uri.key);
        if (!doc) {
            // We shouldn't get a change text request for a closed doc.
            this.console.error(`Received change text document command for closed file ${uri}`);
            return;
        }

        TextDocument.update(doc, params.contentChanges, params.textDocument.version);
        const newContents = doc.getText();

        // Send this change to all the workspaces that might contain this file.
        const workspaces = await this.getContainingWorkspacesForFile(uri);
        workspaces.forEach((w) => {
            w.service.updateOpenFileContents(uri, params.textDocument.version, newContents);
        });
    }

    protected onDidChangeNotebookDocument = async (params: DidChangeNotebookDocumentParams) => {
        this.recordUserInteractionTime();
        const uri = this.convertLspUriStringToUri(params.notebookDocument.uri);
        const openCells = this._openCells.get(uri.key);
        if (!openCells) {
            this.console.error(`onDidChangeNotebookDocument failed to find open cells for ${uri}`);
            return;
        }
        const changeStructure = params.change.cells?.structure;
        if (changeStructure) {
            const previousCells = [...openCells];
            const newCells = openCells.toSpliced(
                changeStructure.array.start,
                changeStructure.array.deleteCount,
                ...(changeStructure.array.cells?.map((changedTextDocumentItem) => {
                    // if there isn't a cell at this index already, we need to open it
                    const newDocumentItem = changeStructure.didOpen?.find(
                        (newDocument) => newDocument.uri === changedTextDocumentItem.document
                    );
                    if (newDocumentItem) {
                        return TextDocument.create(
                            newDocumentItem.uri,
                            'python',
                            newDocumentItem.version,
                            newDocumentItem.text
                        );
                    } else {
                        const result = openCells.find((openCell) => openCell.uri === changedTextDocumentItem.document);
                        if (!result) {
                            throw new Error(`failed to find existing cell ${changedTextDocumentItem.document}`);
                        }
                        return result;
                    }
                }) ?? [])
            );
            await Promise.all(
                zip(previousCells, newCells).map(async ([previousCell, newCell], index) => {
                    if (previousCell?.uri === newCell?.uri) {
                        return;
                    }
                    if (previousCell === undefined) {
                        // a new cell was added and we didn't already have one at this index so we need to open it
                        if (newCell === undefined) {
                            // this should never happen
                            throw new Error('new cell was undefined when new cell was added');
                        }
                        const cellUri = this.convertLspUriStringToUri(newCell.uri, index);
                        // Send this open to all the workspaces that might contain this file.
                        const workspaces = await this.getContainingWorkspacesForFile(cellUri);
                        workspaces.forEach((w) => {
                            w.service.setFileOpened(
                                cellUri,
                                newCell.version,
                                newCell.getText(),
                                IPythonMode.CellDocs,
                                this._getChainedFileUri(newCell, index)
                            );
                        });
                    } else {
                        const cellUri = this.convertLspUriStringToUri(params.notebookDocument.uri, index);
                        const workspaces = await this.getContainingWorkspacesForFile(cellUri);
                        if (newCell === undefined) {
                            // a cell was deleted and there's no longer a cell at this index so we need to close it
                            // Send this close to all the workspaces that might contain this file. note that we also
                            // need to clear diagnostics for the vscode cell uri that no longer exists, which is done
                            // below using didClose
                            workspaces.forEach((w) => w.service.setFileClosed(cellUri));
                        } else {
                            // this index now has a different cell than it did before (ie. order was changed) so we have to update the already opened cell
                            // with the new text content
                            const newContents = newCell.getText();
                            // Send this change to all the workspaces that might contain this file.
                            workspaces.forEach((w) => {
                                w.service.updateOpenFileContents(
                                    cellUri,
                                    previousCell.version + 1,
                                    newContents,
                                    IPythonMode.CellDocs
                                );
                                w.service.updateChainedUri(cellUri, this._getChainedFileUri(newCell, index));
                            });
                        }
                    }
                })
            );
            if (changeStructure.didClose) {
                await Promise.all(
                    changeStructure.didClose.map((document) =>
                        // the setFileClosed above will just remove the diagnostics for the underlying cell at the index that
                        // no longer exists, but we need to also clear diagnostics for the vscode cell uri even if it
                        // was replaced with a different cell at the same index, bwcause vscode will assign it a
                        // different uri
                        this.connection.sendDiagnostics({ diagnostics: [], uri: document.uri })
                    )
                );
            }
            this._openCells.set(uri.key, newCells);
        }
        if (params.change.cells?.textContent) {
            await Promise.all(
                params.change.cells.textContent.map(async (textContent) => {
                    const cellUri = this.convertLspUriStringToUri(textContent.document.uri);
                    const doc = this._openCells.get(uri.key)?.find((cell) => cell.uri === textContent.document.uri);
                    if (!doc) {
                        // We shouldn't get a change text request for a closed doc.
                        this.console.error(`failed to find document for changed cell ${cellUri}`);
                        return;
                    }
                    TextDocument.update(doc, textContent.changes, textContent.document.version);
                    const newContents = doc.getText();
                    // Send this change to all the workspaces that might contain this file.
                    const workspaces = await this.getContainingWorkspacesForFile(cellUri);
                    workspaces.forEach((w) =>
                        w.service.updateOpenFileContents(
                            cellUri,
                            textContent.document.version,
                            newContents,
                            IPythonMode.CellDocs
                        )
                    );
                })
            );
        }
    };

    protected async onDidCloseTextDocument(params: DidCloseTextDocumentParams, cellIndex?: number) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri, cellIndex);

        // Send this close to all the workspaces that might contain this file.
        const workspaces = await this.getContainingWorkspacesForFile(uri);
        workspaces.forEach((w) => {
            w.service.setFileClosed(uri);
        });

        this.openFileMap.delete(uri.key);
    }

    protected onDidCloseNotebookDocument = async (params: DidCloseNotebookDocumentParams) => {
        const uri = this.convertLspUriStringToUri(params.notebookDocument.uri);
        const openCells = this._openCells.get(uri.key);
        if (!openCells) {
            this.console.error(`onDidCloseNotebookDocument failed to find open cells for ${uri}`);
            return;
        }
        await Promise.all(
            params.cellTextDocuments.map(async (textDocument) => {
                const cellUri = this.convertLspUriStringToUri(textDocument.uri);
                // Send this close to all the workspaces that might contain this file.
                const workspaces = await this.getContainingWorkspacesForFile(cellUri);
                workspaces.forEach((w) => w.service.setFileClosed(cellUri));
            })
        );
        this._openCells.delete(uri.key);
    };

    protected async onDiagnostics(params: DocumentDiagnosticParams, token: CancellationToken) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);
        const workspace = await this.getWorkspaceForFile(uri);
        let sourceFile = workspace.service.getSourceFile(uri);
        let diagnosticsVersion = sourceFile?.isCheckingRequired()
            ? UncomputedDiagnosticsVersion
            : sourceFile?.getDiagnosticVersion() ?? UncomputedDiagnosticsVersion;
        const result: DocumentDiagnosticReport = {
            kind: 'full',
            resultId: sourceFile?.getDiagnosticVersion()?.toString(),
            items: [],
        };
        if (!canNavigateToFile(workspace.service.fs, uri) || token.isCancellationRequested) {
            return result;
        }

        // Send a progress message to the client.
        this.incrementAnalysisProgress();

        let serverDiagnostics: AnalyzerDiagnostic[] = [];

        try {
            // Reanalyze the file if it's not up to date.
            if (params.previousResultId !== diagnosticsVersion.toString() && sourceFile) {
                let diagnosticsVersionAfter = UncomputedDiagnosticsVersion - 1; // Just has to be different

                // Loop until we analyze the same version that we started with.
                while (diagnosticsVersion !== diagnosticsVersionAfter && !token.isCancellationRequested && sourceFile) {
                    // Reset the version we're analyzing
                    sourceFile = workspace.service.getSourceFile(uri);
                    diagnosticsVersion = sourceFile?.getDiagnosticVersion() ?? UncomputedDiagnosticsVersion;

                    // Then reanalyze the file (this should go to the background thread so this thread can handle other requests).
                    if (sourceFile) {
                        serverDiagnostics = await workspace.service.analyzeFileAndGetDiagnostics(uri, token);
                    }

                    // If any text edits came in, make sure we reanalyze the file. Diagnostics version should be reset to zero
                    // if a text edit comes in.
                    const sourceFileAfter = workspace.service.getSourceFile(uri);
                    diagnosticsVersionAfter = sourceFileAfter?.getDiagnosticVersion() ?? UncomputedDiagnosticsVersion;
                }

                // Then convert the diagnostics to the LSP format.
                const lspDiagnostics = this._convertDiagnostics(workspace.service.fs, serverDiagnostics).filter(
                    (d) => d !== undefined
                ) as Diagnostic[];

                result.resultId =
                    diagnosticsVersionAfter === UncomputedDiagnosticsVersion
                        ? undefined
                        : diagnosticsVersionAfter.toString();
                result.items = lspDiagnostics;
            } else {
                (result as any).kind = 'unchanged';
                result.resultId =
                    diagnosticsVersion === UncomputedDiagnosticsVersion ? undefined : diagnosticsVersion.toString();
                delete (result as any).items;
            }
            if (sourceFile) {
                this.documentsWithDiagnostics[uri.toString()] = {
                    reason: 'analysis',
                    fileUri: uri,
                    cell: sourceFile.getCellIndex(),
                    diagnostics: serverDiagnostics,
                    version: diagnosticsVersion,
                };
            }
        } finally {
            this.decrementAnalysisProgress();
        }

        return result;
    }

    protected async onWorkspaceDiagnostics(params: WorkspaceDiagnosticParams, token: CancellationToken) {
        const workspaces = await this.getWorkspaces();
        const promises: Promise<WorkspaceDocumentDiagnosticReport>[] = [];
        workspaces.forEach((workspace) => {
            if (!workspace.disableLanguageServices) {
                const files = workspace.service.getOwnedFiles();
                files.forEach((file) => {
                    const sourceFile = workspace.service.getSourceFile(file)!;
                    if (canNavigateToFile(workspace.service.fs, sourceFile.getUri())) {
                        promises.push(this._getWorkspaceDocumentDiagnostics(params, sourceFile, workspace, token));
                    }
                });
            }
        });
        return {
            items: await Promise.all(promises),
        };
    }

    protected onDidChangeWatchedFiles(params: DidChangeWatchedFilesParams) {
        params.changes.forEach((change) => {
            const filePath = this.fs.realCasePath(this.convertLspUriStringToUri(change.uri));
            const eventType: FileWatcherEventType = change.type === 1 ? 'add' : 'change';
            this.serverOptions.fileWatcherHandler.onFileChange(eventType, filePath);
        });
    }

    protected onRenameFiles = async (params: RenameFilesParams) => {
        const result = { documentChanges: Array<TextDocumentEdit>() } satisfies HandlerResult<
            WorkspaceEdit | null,
            never
        >;

        for (const renamedFile of params.files) {
            const oldUri = this.convertLspUriStringToUri(renamedFile.oldUri);
            const newUri = this.convertLspUriStringToUri(renamedFile.newUri);
            if ([oldUri, newUri].some((uri) => uri.stripExtension().pathEndsWith('__init__'))) {
                // TODO: support __init__ files. pylance doesn't support renaming them either so that gives me an excuse to be lazy too
                continue;
            }
            const workspace = await this.getWorkspaceForFile(newUri);
            const program = workspace.service.backgroundAnalysisProgram.program;

            // if the uri being renamed is not part of the workspace, don't bother
            if (!program.containsSourceFileIn(oldUri)) {
                continue;
            }

            const oldFileContents = program.getParseResults(oldUri);
            workspace.service.getUserFiles().forEach((file) => {
                const currentFileParseResults = program.getParseResults(file);
                const oldFile = oldFileContents ?? oldUri;
                if (currentFileParseResults && workspace.rootUri && program.evaluator) {
                    const importFinder = new RenameUsageFinder(program, currentFileParseResults, oldFile, newUri);
                    importFinder.walk(currentFileParseResults.parserOutput.parseTree);
                    result.documentChanges.push({
                        edits: importFinder.edits,
                        textDocument: { uri: file.toString(), version: null },
                    });
                }
            });
        }
        return result;
    };

    /**
     * get the baselined errors for the file we just saved and tell the analysis complete handler
     * that it may need to update the baseline for it
     */
    protected onSaveTextDocument = async (params: WillSaveTextDocumentParams) => {
        this.savedFilesForBaselineUpdate.add(params.textDocument.uri);
        if (this.client.usingPullDiagnostics) {
            // when not running in pull diagnostics mode, the baseline file can't be updated until after analysis
            // is completed, in which case we instead call method later in onAnalysisCompletedHandler
            this.updateBaselineFileIfNeeded();
        }
    };

    protected onSaveNotebookDocument = async (params: DidSaveNotebookDocumentParams) => {
        const uri = this.convertLspUriStringToUri(params.notebookDocument.uri);
        this._openCells.get(uri.key)?.forEach((cell) => this.savedFilesForBaselineUpdate.add(cell.uri));
    };

    protected async onExecuteCommand(
        params: ExecuteCommandParams,
        token: CancellationToken,
        reporter: WorkDoneProgressReporter
    ) {
        // Cancel running command if there is one.
        if (this._pendingCommandCancellationSource) {
            this._pendingCommandCancellationSource.cancel();
            this._pendingCommandCancellationSource = undefined;
        }

        const executeCommand = async (token: CancellationToken) => {
            const result = await this.executeCommand(params, token);
            if (WorkspaceEdit.is(result)) {
                // Tell client to apply edits.
                // Do not await; the client isn't expecting a result.
                this.connection.workspace.applyEdit({
                    label: `Command '${params.command}'`,
                    edit: result,
                    metadata: { isRefactoring: this.isRefactoringCommand(params.command) },
                });
            }

            if (CommandResult.is(result)) {
                // Tell client to apply edits.
                // Await so that we return after the edit is complete.
                await this.connection.workspace.applyEdit({
                    label: result.label,
                    edit: result.edits,
                    metadata: { isRefactoring: this.isRefactoringCommand(params.command) },
                });
            }

            return result;
        };

        if (this.isLongRunningCommand(params.command)) {
            // Create a progress dialog for long-running commands.
            const progress = await this.getProgressReporter(reporter, Localizer.CodeAction.executingCommand(), token);

            const source = progress.source;
            this._pendingCommandCancellationSource = source;

            try {
                const result = await executeCommand(source.token);
                return result;
            } finally {
                progress.reporter.done();
                source.dispose();
            }
        } else {
            const result = await executeCommand(token);
            return result;
        }
    }

    protected onShutdown(token: CancellationToken) {
        // Shutdown remaining workspaces.
        this.workspaceFactory.clear();

        // Stop tracking all open files.
        this.openFileMap.clear();
        this._openCells.clear();
        this.serviceProvider.dispose();

        return Promise.resolve();
    }

    protected async convertDiagnostics(
        fs: FileSystem,
        fileDiagnostics: FileDiagnostics
    ): Promise<PublishDiagnosticsParams> {
        return {
            uri: this.convertUriToLspUriString(fs, fileDiagnostics.fileUri),
            version: fileDiagnostics.version,
            diagnostics: this._convertDiagnostics(fs, fileDiagnostics.diagnostics),
        };
    }

    protected getDiagCode(_diag: AnalyzerDiagnostic, rule: string | undefined): string | undefined {
        return rule;
    }

    /**
     * updates the baseline file if the source file was saved. we intentionally only do this on-save instead
     * of every time diagnostics are sent because otherwise it would remove diagnostics from the baseline file
     * too aggressively (eg. the user moves a chunk of code using cut/paste, then baselined diagnostics come back
     * unintentionally)
     */
    protected updateBaselineFileIfNeeded = async () => {
        const filesRequiringBaselineUpdate = new Map<Workspace, FileDiagnostics[]>();
        for (const textDocumentUri of this.savedFilesForBaselineUpdate) {
            const fileUri = this.convertLspUriStringToUri(textDocumentUri);
            // can't use result.diagnostics because we need the diagnostics from the previous analysis since
            // saves don't trigger checking (i think)
            const fileDiagnostics = this.documentsWithDiagnostics[fileUri.toString()];
            if (!fileDiagnostics || fileDiagnostics.reason !== 'analysis') {
                continue;
            }
            const workspace = await this.getWorkspaceForFile(fileUri);
            if (!filesRequiringBaselineUpdate.has(workspace)) {
                filesRequiringBaselineUpdate.set(workspace, []);
            }
            filesRequiringBaselineUpdate.get(workspace)!.push(fileDiagnostics);
        }
        for (const [workspace, files] of filesRequiringBaselineUpdate.entries()) {
            if (!workspace.rootUri) {
                continue;
            }
            const baseline = workspace.service.backgroundAnalysisProgram.program.baselineHandler;
            const baselineDiffSummary = baseline.write(false, false, files)?.getSummaryMessage();
            if (baselineDiffSummary) {
                this.console.info(
                    `${baselineDiffSummary}. files: ${files.map((file) => file.fileUri.toString()).join(', ')}`
                );
            }
        }
        this.savedFilesForBaselineUpdate.clear();
    };

    protected async onAnalysisCompletedHandler(fs: FileSystem, results: AnalysisResults): Promise<void> {
        // If we're in pull mode, disregard any 'tracking' results. They're not necessary.
        if (this.client.usingPullDiagnostics && results.reason === 'tracking') {
            return;
        }
        // Send the computed diagnostics to the client.
        results.diagnostics.forEach((fileDiag) => {
            if (!this.canNavigateToFile(fileDiag.fileUri, fs)) {
                return;
            }

            this.sendDiagnostics(fs, { ...fileDiag, reason: results.reason });
        });

        // if any baselined diagnostics disappeared, update the baseline for the effected files
        if (
            results.reason === 'analysis' &&
            // if there are still any files requirign analysis, don't update the baseline file as it could
            // incorrectly delete diagnostics that are still present
            !results.requiringAnalysisCount.files &&
            !results.requiringAnalysisCount.cells
        ) {
            this.updateBaselineFileIfNeeded();
        }

        if (!this._progressReporter.isEnabled(results)) {
            // Make sure to disable progress bar if it is currently active.
            // This can happen if a user changes typeCheckingMode in the middle
            // of analysis.
            // end() is noop if there is no active progress bar.
            this._progressReporter.end();
            return;
        }

        // Update progress.
        this.sendProgressMessage(results.requiringAnalysisCount.files);
    }

    protected incrementAnalysisProgress() {
        this._progressReportCounter += 1;
        this.sendProgressMessage(this._progressReportCounter);
    }

    protected decrementAnalysisProgress() {
        this._progressReportCounter -= 1;
        if (this._progressReportCounter < 0) {
            this._progressReportCounter = 0;
        }
        this.sendProgressMessage(this._progressReportCounter);
    }

    protected sendProgressMessage(fileCount: number) {
        if (fileCount <= 0) {
            this._progressReporter.end();
            return;
        }
        const progressMessage =
            fileCount === 1
                ? Localizer.CodeAction.filesToAnalyzeOne()
                : Localizer.CodeAction.filesToAnalyzeCount().format({
                      count: fileCount,
                  });

        // Update progress.
        if (!this._progressReporter.isDisplayingProgess()) {
            this._progressReporter.begin();
        }
        this._progressReporter.report(progressMessage);
    }

    protected onWorkspaceCreated(workspace: Workspace) {
        // Update settings on this workspace (but only if initialize has happened)
        if (this._initialized) {
            this.updateSettingsForWorkspace(workspace, workspace.isInitialized).ignoreErrors();
        }

        // Otherwise the initialize completion should cause settings to be updated on all workspaces.
    }

    protected onWorkspaceRemoved(workspace: Workspace) {
        const otherWorkspaces = this.workspaceFactory.items().filter((w) => w !== workspace);

        for (const fileWithDiagnostics of Object.values(this.documentsWithDiagnostics)) {
            if (workspace.service.isTracked(fileWithDiagnostics.fileUri)) {
                // Do not clean up diagnostics for files tracked by multiple workspaces
                if (otherWorkspaces.some((w) => w.service.isTracked(fileWithDiagnostics.fileUri))) {
                    continue;
                }
                this.sendDiagnostics(this.fs, {
                    fileUri: fileWithDiagnostics.fileUri,
                    cell: fileWithDiagnostics.cell,
                    diagnostics: fileWithDiagnostics.diagnostics,
                    version: undefined,
                    reason: 'tracking',
                });
            }
        }
    }

    protected createAnalyzerServiceForWorkspace(
        name: string,
        workspaceRoot: Uri | undefined,
        kinds: string[],
        services?: WorkspaceServices
    ): AnalyzerService {
        // 5 seconds default
        const defaultBackOffTime = 5 * 1000;

        return this.createAnalyzerService(name, workspaceRoot || Uri.empty(), services, () => defaultBackOffTime);
    }

    protected recordUserInteractionTime() {
        // Tell all of the services that the user is actively
        // interacting with one or more editors, so they should
        // back off from performing any work.
        this.workspaceFactory.items().forEach((workspace: { service: { recordUserInteractionTime: () => void } }) => {
            workspace.service.recordUserInteractionTime();
        });
    }

    protected getDocumentationUrlForDiagnostic(diag: AnalyzerDiagnostic): string | undefined {
        const rule = diag.getRule();
        if (rule) {
            // config-files.md is configured to have a link for every rule name.
            return `${website}/configuration/config-files/#${rule}`;
        }
        return undefined;
    }

    protected abstract createProgressReporter(): ProgressReporter;

    protected canNavigateToFile(path: Uri, fs: FileSystem): boolean {
        return (
            canNavigateToFile(fs, path) &&
            // if it's a notebook but the user hasn't opened it yet (should only happen when diagnosticMode is "workspace"),
            // there's no way for us to know the cell URI. see https://github.com/microsoft/language-server-protocol/issues/2097.
            // this isn't ideal because it means the "workspace" diagnostic mode doesn't work on notebooks so the user always
            // has to open them before diagnostics are reported for them, but pylance seems to behave the same way so whatever
            (!this._isNotebookUri(path) || this._convertUriToLspNotebookCellUri(path) !== undefined)
        );
    }

    protected async getProgressReporter(reporter: WorkDoneProgressReporter, title: string, token: CancellationToken) {
        // This is a bit ugly, but we need to determine whether the provided reporter
        // is an actual client-side progress reporter or a dummy (null) progress reporter
        // created by the LSP library. If it's the latter, we'll create a server-initiated
        // progress reporter.
        if (!isNullProgressReporter(reporter)) {
            return { reporter: reporter, source: CancelAfter(this.serviceProvider.cancellationProvider(), token) };
        }

        const serverInitiatedReporter = await this.connection.window.createWorkDoneProgress();
        serverInitiatedReporter.begin(
            title,
            /* percentage */ undefined,
            /* message */ undefined,
            /* cancellable */ true
        );

        return {
            reporter: serverInitiatedReporter,
            source: CancelAfter(this.serviceProvider.cancellationProvider(), token, serverInitiatedReporter.token),
        };
    }

    protected async sendDiagnostics(
        fs: FileSystem,
        fileWithDiagnostics: FileDiagnostics & { reason: 'analysis' | 'tracking' }
    ) {
        const key = fileWithDiagnostics.fileUri.toString();
        this.documentsWithDiagnostics[key] = fileWithDiagnostics;
        this.connection.sendDiagnostics(await this.convertDiagnostics(fs, fileWithDiagnostics));
    }

    protected addDynamicFeature(feature: DynamicFeature) {
        this.dynamicFeatures.add(feature);
    }

    protected convertLspUriStringToUri(uri: string, cellIndex?: number) {
        const parsedUri = Uri.parse(uri, this.serverOptions.serviceProvider);
        let result;
        // if it's a cell but an index wasn't provided, we need to figure out what index this cell is currently at
        if (parsedUri.scheme === 'vscode-notebook-cell') {
            if (cellIndex === undefined) {
                const notebookUri = Uri.file(parsedUri.getPath(), this.serviceProvider);
                cellIndex = this._openCells.get(notebookUri.key)?.findIndex((cell) => cell.uri === uri);
                if (cellIndex === undefined) {
                    // can happen if it's a newly created notebook that hasn't been saved to disk yet or if it's an
                    // interactive cell
                    return parsedUri;
                }
            }
            // remove the vscode-notebook-cell:// scheme
            result = result = Uri.file(parsedUri.getPath(), this.serviceProvider);
        } else {
            result = parsedUri;
        }
        if (cellIndex === undefined) {
            return result;
        }
        return result.withFragment(cellIndex.toString());
    }

    /**
     * if cellIndex > 0 then it has a chained file, which should always just be the previous index because we update them
     * on every change
     */
    private _getChainedFileUri = (cell: { uri: string }, index: number) =>
        index ? this.convertLspUriStringToUri(cell.uri, index - 1) : undefined;

    /**
     * converts the uri for a notebook cell from our format to vscode's for the language server.
     * @returns `undefined` if the cell is not open or if it's not a notebook cell uri
     */
    private _convertUriToLspNotebookCellUri = (uri: Uri) =>
        this._openCells.get(uri.withFragment('').key)?.[Number(uri.fragment)];

    /**
     * whether the uri is for a notebook cell (our format, not the format used by vscode)
     */
    private _isNotebookUri = (uri: Uri) => !!uri.fragment && !this._isLspNotebookUri(uri);

    /**
     * whether the uri is vscode's representation of a notebook cell
     */
    private _isLspNotebookUri = (uri: Uri) => uri.scheme === 'vscode-notebook-cell';

    private _getCompatibleMarkupKind(clientSupportedFormats: MarkupKind[] | undefined) {
        const serverSupportedFormats = [MarkupKind.PlainText, MarkupKind.Markdown];

        for (const format of clientSupportedFormats ?? []) {
            if (serverSupportedFormats.includes(format)) {
                return format;
            }
        }

        return MarkupKind.PlainText;
    }
    private async _getWorkspaceDocumentDiagnostics(
        params: WorkspaceDiagnosticParams,
        sourceFile: SourceFile,
        workspace: Workspace,
        token: CancellationToken
    ) {
        const originalUri = workspace.service.fs.getOriginalUri(sourceFile.getUri());
        const result: WorkspaceDocumentDiagnosticReport = {
            uri: originalUri.toString(),
            version: sourceFile.getClientVersion() ?? null,
            kind: 'full',
            items: [],
        };
        const previousId = params.previousResultIds.find((x) => x.uri === originalUri.toString());
        const documentResult = await this.onDiagnostics(
            { previousResultId: previousId?.value, textDocument: { uri: result.uri } },
            token
        );
        if (documentResult.kind === 'full') {
            result.items = documentResult.items;
        } else {
            (result as any).kind = documentResult.kind;
            delete (result as any).items;
        }
        return result;
    }

    private _convertDiagnostics(fs: FileSystem, diags: AnalyzerDiagnostic[]): Diagnostic[] {
        const convertedDiags: Diagnostic[] = [];
        diags.forEach((diag) => {
            const severity = convertCategoryToSeverity(diag.category);
            const rule = diag.getRule() as DiagnosticRule;
            const code = this.getDiagCode(diag, rule);
            const vsDiag = Diagnostic.create(diag.range, diag.message, severity, code, this.serverOptions.productName);

            if (diag.category === DiagnosticCategory.TaskItem) {
                // TaskItem is not supported.
                return;
            }
            if (diag.baselined) {
                vsDiag.message = `Baselined: ${vsDiag.message}`;
                assert(
                    diag.category === DiagnosticCategory.Hint,
                    `a baselined diagnostic somehow had the wrong diagnostic category: ${diag.message} (${diag.category})`
                );
            }
            if (deprecatedDiagnosticRules().includes(rule)) {
                vsDiag.tags = [DiagnosticTag.Deprecated];
            } else if ([...unreachableDiagnosticRules(), ...unusedDiagnosticRules()].includes(rule)) {
                vsDiag.tags = [DiagnosticTag.Unnecessary];
            }
            if (rule) {
                const ruleDocUrl = this.getDocumentationUrlForDiagnostic(diag);
                if (ruleDocUrl) {
                    vsDiag.codeDescription = {
                        href: ruleDocUrl,
                    };
                }
            }

            const relatedInfo = diag.getRelatedInfo();
            if (relatedInfo.length > 0) {
                vsDiag.relatedInformation = relatedInfo
                    .filter((info) => this.canNavigateToFile(info.uri, fs))
                    .map((info) =>
                        DiagnosticRelatedInformation.create(
                            Location.create(this.convertUriToLspUriString(fs, info.uri), info.range),
                            info.message
                        )
                    );
            }

            convertedDiags.push(vsDiag);
        });

        function convertCategoryToSeverity(category: DiagnosticCategory) {
            switch (category) {
                case DiagnosticCategory.Error:
                    return DiagnosticSeverity.Error;

                case DiagnosticCategory.Warning:
                    return DiagnosticSeverity.Warning;

                case DiagnosticCategory.Information:
                case DiagnosticCategory.TaskItem: // task items only show up in the task list if they are information or above.
                    return DiagnosticSeverity.Information;

                case DiagnosticCategory.Hint:
                    return DiagnosticSeverity.Hint;
            }
        }

        return convertedDiags;
    }
}
