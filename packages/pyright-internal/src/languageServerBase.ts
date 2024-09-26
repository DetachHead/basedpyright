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
    DiagnosticRelatedInformation,
    DiagnosticSeverity,
    DiagnosticTag,
    DidChangeConfigurationParams,
    DidChangeTextDocumentParams,
    DidChangeWatchedFilesParams,
    DidCloseTextDocumentParams,
    DidOpenTextDocumentParams,
    Disposable,
    DocumentHighlight,
    DocumentHighlightParams,
    DocumentSymbol,
    DocumentSymbolParams,
    ExecuteCommandParams,
    HandlerResult,
    HoverParams,
    InitializeParams,
    InitializeResult,
    Location,
    MarkupKind,
    MessageType,
    PrepareRenameParams,
    PublishDiagnosticsParams,
    ReferenceParams,
    RemoteWindow,
    RenameFilesParams,
    RenameParams,
    ShowMessageNotification,
    SignatureHelp,
    SignatureHelpParams,
    SymbolInformation,
    TextDocumentEdit,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    WorkDoneProgressReporter,
    WorkspaceEdit,
    WorkspaceFoldersChangeEvent,
    WorkspaceSymbol,
    WorkspaceSymbolParams,
} from 'vscode-languageserver';
import {
    InlayHint,
    InlayHintParams,
    SemanticTokens,
    SemanticTokensParams,
    WillSaveTextDocumentParams,
} from 'vscode-languageserver-protocol';
import { ResultProgressReporter } from 'vscode-languageserver';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { AnalysisResults } from './analyzer/analysis';
import { BackgroundAnalysisProgram, InvalidatedReason } from './analyzer/backgroundAnalysisProgram';
import { ImportResolver } from './analyzer/importResolver';
import { MaxAnalysisTime } from './analyzer/program';
import { AnalyzerService, LibraryReanalysisTimeProvider, getNextServiceId } from './analyzer/service';
import { IPythonMode } from './analyzer/sourceFile';
import type { BackgroundAnalysisBase } from './backgroundAnalysisBase';
import { CommandResult } from './commands/commandResult';
import { CancelAfter } from './common/cancellationUtils';
import { CaseSensitivityDetector } from './common/caseSensitivityDetector';
import { getNestedProperty } from './common/collectionUtils';
import { DiagnosticSeverityOverrides, getDiagnosticSeverityOverrides } from './common/commandLineOptions';
import { ConfigOptions, getDiagLevelDiagnosticRules, parseDiagLevel } from './common/configOptions';
import { ConsoleInterface, ConsoleWithLogLevel, LogLevel } from './common/console';
import { Diagnostic as AnalyzerDiagnostic, DiagnosticCategory } from './common/diagnostic';
import { DiagnosticRule } from './common/diagnosticRules';
import { FileDiagnostics } from './common/diagnosticSink';
import { FileSystem, ReadOnlyFileSystem } from './common/fileSystem';
import { FileWatcherEventType } from './common/fileWatcher';
import { Host } from './common/host';
import {
    ClientCapabilities,
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
import { convertUriToLspUriString } from './common/uri/uriUtils';
import { AnalyzerServiceExecutor } from './languageService/analyzerServiceExecutor';
import { CallHierarchyProvider } from './languageService/callHierarchyProvider';
import { InlayHintsProvider } from './languageService/inlayHintsProvider';
import { CompletionItemData, CompletionProvider } from './languageService/completionProvider';
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
import { InitStatus, WellKnownWorkspaceKinds, Workspace, WorkspaceFactory } from './workspaceFactory';
import { githubRepo } from './constants';
import { SemanticTokensProvider, SemanticTokensProviderLegend } from './languageService/semanticTokensProvider';
import { RenameUsageFinder } from './analyzer/renameUsageFinder';
import { BaselinedDiagnostic, getBaselinedErrorsForFile, writeDiagnosticsToBaselineFile } from './baseline';

export abstract class LanguageServerBase implements LanguageServerInterface, Disposable {
    // We support running only one "find all reference" at a time.
    private _pendingFindAllRefsCancellationSource: AbstractCancellationTokenSource | undefined;

    // We support running only one command at a time.
    private _pendingCommandCancellationSource: AbstractCancellationTokenSource | undefined;

    private _progressReporter: ProgressReporter;

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
        supportsDeprecatedDiagnosticTag: false,
        supportsUnnecessaryDiagnosticTag: false,
        supportsTaskItemDiagnosticTag: false,
        completionItemResolveSupportsAdditionalTextEdits: false,
    };

    protected defaultClientConfig: any;

    protected readonly workspaceFactory: WorkspaceFactory;
    protected readonly openFileMap = new Map<string, TextDocument>();
    protected readonly fs: FileSystem;
    protected readonly caseSensitiveDetector: CaseSensitivityDetector;

    protected readonly savedFilesForBaselineUpdate = new Map<
        Uri,
        { workspace: Workspace; baseline: readonly BaselinedDiagnostic[] }
    >();

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
        this.dynamicFeatures.unregister();
        this._workspaceFoldersChangedDisposable?.dispose();
    }

    abstract createBackgroundAnalysis(serviceId: string): BackgroundAnalysisBase | undefined;

    abstract getSettings(workspace: Workspace): Promise<ServerSettings>;

    // Creates a service instance that's used for analyzing a
    // program within a workspace.
    createAnalyzerService(
        name: string,
        services?: WorkspaceServices,
        libraryReanalysisTimeProvider?: LibraryReanalysisTimeProvider
    ): AnalyzerService {
        this.console.info(`Starting service instance "${name}"`);

        const serviceId = getNextServiceId(name);
        const service = new AnalyzerService(name, this.serverOptions.serviceProvider, {
            console: this.console,
            hostFactory: this.createHost.bind(this),
            importResolverFactory: this.createImportResolver.bind(this),
            backgroundAnalysis: services ? services.backgroundAnalysis : this.createBackgroundAnalysis(serviceId),
            maxAnalysisTime: this.serverOptions.maxAnalysisTimeInForeground,
            backgroundAnalysisProgramFactory: this.createBackgroundAnalysisProgram.bind(this),
            cancellationProvider: this.serverOptions.cancellationProvider,
            libraryReanalysisTimeProvider,
            serviceId,
            fileSystem: services?.fs ?? this.serverOptions.serviceProvider.fs(),
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
        backgroundAnalysis?: BackgroundAnalysisBase,
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
        this.connection.onDidChangeWatchedFiles((params) => this.onDidChangeWatchedFiles(params));
        this.connection.workspace.onWillRenameFiles(this.onRenameFiles);
        this.connection.onWillSaveTextDocument(this.onSaveTextDocument);
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
        const supportedDiagnosticTags = capabilities.textDocument?.publishDiagnostics?.tagSupport?.valueSet || [];
        this.client.supportsUnnecessaryDiagnosticTag = supportedDiagnosticTags.some(
            (tag) => tag === DiagnosticTag.Unnecessary
        );
        this.client.supportsDeprecatedDiagnosticTag = supportedDiagnosticTags.some(
            (tag) => tag === DiagnosticTag.Deprecated
        );
        // if the client is running in VS, it always supports task item diagnostics
        this.client.supportsTaskItemDiagnosticTag = this.client.hasVisualStudioExtensionsCapability;
        this.client.hasWindowProgressCapability = !!capabilities.window?.workDoneProgress;
        this.client.hasGoToDeclarationCapability = !!capabilities.textDocument?.declaration;
        this.client.completionItemResolveSupportsAdditionalTextEdits =
            !!capabilities.textDocument?.completion?.completionItem?.resolveSupport?.properties.some(
                (p) => p === 'additionalTextEdits'
            );

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
        };

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
            .map((loc) => Location.create(convertUriToLspUriString(workspace.service.fs, loc.uri), loc.range));
    }

    protected async onReferences(
        params: ReferenceParams,
        token: CancellationToken,
        workDoneReporter: WorkDoneProgressReporter,
        resultReporter: ResultProgressReporter<Location[]> | undefined,
        createDocumentRange?: (uri: Uri, result: CollectionResult, parseResults: ParseFileResults) => DocumentRange,
        convertToLocation?: (fs: ReadOnlyFileSystem, ranges: DocumentRange) => Location | undefined
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
                token
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
            token
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
                },
                token
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
                    },
                    token
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
            return new RenameProvider(program, uri, params.position, token).canRenameSymbol(
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
            return new RenameProvider(program, uri, params.position, token).renameSymbol(
                params.newName,
                workspace.kinds.includes(WellKnownWorkspaceKinds.Default),
                isUntitled
            );
        }, token);
    }

    protected async onInlayHints(params: InlayHintParams, token: CancellationToken): Promise<InlayHint[] | null> {
        const uri = Uri.parse(params.textDocument.uri, this.serviceProvider);
        const workspace = await this.getWorkspaceForFile(uri);

        if (workspace.disableLanguageServices) {
            return null;
        }
        return workspace.service.run((program) => {
            return new InlayHintsProvider(program, uri, params.range).onInlayHints();
        }, token);
    }

    protected async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const uri = Uri.parse(params.textDocument.uri, this.serviceProvider);
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
            return new CallHierarchyProvider(program, uri, params.position, token).onPrepare();
        }, token);
    }

    protected async onCallHierarchyIncomingCalls(params: CallHierarchyIncomingCallsParams, token: CancellationToken) {
        const uri = this.convertLspUriStringToUri(params.item.uri);

        const workspace = await this.getWorkspaceForFile(uri);
        if (workspace.disableLanguageServices) {
            return null;
        }

        return workspace.service.run((program) => {
            return new CallHierarchyProvider(program, uri, params.item.range.start, token).getIncomingCalls();
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
            return new CallHierarchyProvider(program, uri, params.item.range.start, token).getOutgoingCalls();
        }, token);
    }

    protected async onDidOpenTextDocument(params: DidOpenTextDocumentParams, ipythonMode = IPythonMode.None) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);

        let doc = this.openFileMap.get(uri.key);
        if (doc) {
            // We shouldn't get an open text document request for an already-opened doc.
            this.console.error(`Received redundant open text document command for ${uri}`);
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
            w.service.setFileOpened(uri, params.textDocument.version, params.textDocument.text, ipythonMode);
        });
    }

    protected async onDidChangeTextDocument(params: DidChangeTextDocumentParams, ipythonMode = IPythonMode.None) {
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
            w.service.updateOpenFileContents(uri, params.textDocument.version, newContents, ipythonMode);
        });
    }

    protected async onDidCloseTextDocument(params: DidCloseTextDocumentParams) {
        const uri = this.convertLspUriStringToUri(params.textDocument.uri);

        // Send this close to all the workspaces that might contain this file.
        const workspaces = await this.getContainingWorkspacesForFile(uri);
        workspaces.forEach((w) => {
            w.service.setFileClosed(uri);
        });

        this.openFileMap.delete(uri.key);
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
            workspace.service.getUserFiles().forEach((file) => {
                const currentFileParseResults = program.getParseResults(file);
                const oldFile = program.getParseResults(oldUri) ?? oldUri;
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
        const fileUri = Uri.file(params.textDocument.uri, this.serviceProvider);
        const workspace = await this.getWorkspaceForFile(fileUri);
        if (workspace.rootUri) {
            this.savedFilesForBaselineUpdate.set(fileUri, {
                workspace,
                baseline: getBaselinedErrorsForFile(this.fs, workspace.rootUri, fileUri),
            });
        }
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

        return Promise.resolve();
    }

    protected async convertDiagnostics(
        fs: FileSystem,
        fileDiagnostics: FileDiagnostics
    ): Promise<PublishDiagnosticsParams> {
        return {
            uri: convertUriToLspUriString(fs, fileDiagnostics.fileUri),
            version: fileDiagnostics.version,
            diagnostics: this._convertDiagnostics(fs, fileDiagnostics.diagnostics),
        };
    }

    protected getDiagCode(_diag: AnalyzerDiagnostic, rule: string | undefined): string | undefined {
        return rule;
    }

    protected async onAnalysisCompletedHandler(fs: FileSystem, results: AnalysisResults): Promise<void> {
        // Send the computed diagnostics to the client.
        results.diagnostics.forEach((fileDiag) => {
            if (!this.canNavigateToFile(fileDiag.fileUri, fs)) {
                return;
            }

            this.sendDiagnostics(fs, { ...fileDiag, reason: results.reason });
        });

        results.configParseErrors.forEach((error) =>
            this.connection.sendNotification(ShowMessageNotification.type, { message: error, type: MessageType.Error })
        );

        // if any baselined diagnostics disappeared, update the baseline for the effected files
        if (
            results.reason === 'analysis' &&
            // if there are still any files requirign analysis, don't update the baseline file as it could
            // incorrectly delete diagnostics that are still present
            !results.requiringAnalysisCount.files &&
            !results.requiringAnalysisCount.cells
        ) {
            const filesRequiringBaselineUpdate = new Map<Workspace, FileDiagnostics[]>();
            for (const [fileUri, savedFileInfo] of this.savedFilesForBaselineUpdate.entries()) {
                // can't use result.diagnostics because we need the diagnostics from the previous analysis since
                // saves don't trigger checking (i think)
                const fileDiagnostics = this.documentsWithDiagnostics[fileUri.toString()];
                if (!fileDiagnostics || fileDiagnostics.reason !== 'analysis') {
                    continue;
                }
                const baselineInfo = getBaselinedErrorsForFile(this.fs, savedFileInfo.workspace.rootUri!, fileUri);
                if (
                    // no baseline file exists or no baselined errors exist for this file
                    !baselineInfo.length ||
                    // there are diagnostics that haven't been baselined, so we don't want to write them
                    // because the user will have to either fix the diagnostics or explicitly write them to the
                    // baseline themselves
                    fileDiagnostics.diagnostics.some((diagnostic) => !diagnostic.baselineStatus)
                ) {
                    continue;
                }
                if (!filesRequiringBaselineUpdate.has(savedFileInfo.workspace)) {
                    filesRequiringBaselineUpdate.set(savedFileInfo.workspace, []);
                }
                filesRequiringBaselineUpdate.get(savedFileInfo.workspace)!.push(fileDiagnostics);
            }
            for (const [workspace, files] of filesRequiringBaselineUpdate.entries()) {
                writeDiagnosticsToBaselineFile(this.fs, workspace.rootUri!, files, true);
            }
            this.savedFilesForBaselineUpdate.clear();
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
        const progressMessage = this.getProgressMessage(results);
        if (progressMessage) {
            this._progressReporter.begin();
            this._progressReporter.report(progressMessage);
        } else {
            this._progressReporter.end();
        }
    }

    protected getProgressMessage(results: AnalysisResults): string | undefined {
        const fileCount = results.requiringAnalysisCount.files;

        if (fileCount === 0) {
            return undefined;
        }

        const progressMessage =
            fileCount === 1
                ? Localizer.CodeAction.filesToAnalyzeOne()
                : Localizer.CodeAction.filesToAnalyzeCount().format({
                      count: fileCount,
                  });
        return progressMessage;
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
                    diagnostics: fileWithDiagnostics.diagnostics,
                    version: undefined,
                    reason: 'tracking',
                });
            }
        }
    }

    protected createAnalyzerServiceForWorkspace(
        name: string,
        uri: Uri,
        kinds: string[],
        services?: WorkspaceServices
    ): AnalyzerService {
        // 5 seconds default
        const defaultBackOffTime = 5 * 1000;

        return this.createAnalyzerService(name, services, () => defaultBackOffTime);
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
            // Configuration.md is configured to have a link for every rule name.
            return `${githubRepo}/blob/main/docs/configuration.md#${rule}`;
        }
        return undefined;
    }

    protected abstract createProgressReporter(): ProgressReporter;

    protected canNavigateToFile(path: Uri, fs: FileSystem): boolean {
        return canNavigateToFile(fs, path);
    }

    protected async getProgressReporter(reporter: WorkDoneProgressReporter, title: string, token: CancellationToken) {
        // This is a bit ugly, but we need to determine whether the provided reporter
        // is an actual client-side progress reporter or a dummy (null) progress reporter
        // created by the LSP library. If it's the latter, we'll create a server-initiated
        // progress reporter.
        if (!isNullProgressReporter(reporter)) {
            return { reporter: reporter, source: CancelAfter(this.serverOptions.cancellationProvider, token) };
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
            source: CancelAfter(this.serverOptions.cancellationProvider, token, serverInitiatedReporter.token),
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

    protected convertLspUriStringToUri(uri: string) {
        return Uri.parse(uri, this.serverOptions.serviceProvider);
    }

    protected addDynamicFeature(feature: DynamicFeature) {
        this.dynamicFeatures.add(feature);
    }

    private _getCompatibleMarkupKind(clientSupportedFormats: MarkupKind[] | undefined) {
        const serverSupportedFormats = [MarkupKind.PlainText, MarkupKind.Markdown];

        for (const format of clientSupportedFormats ?? []) {
            if (serverSupportedFormats.includes(format)) {
                return format;
            }
        }

        return MarkupKind.PlainText;
    }

    private _convertDiagnostics(fs: FileSystem, diags: AnalyzerDiagnostic[]): Diagnostic[] {
        const convertedDiags: Diagnostic[] = [];
        diags
            .filter((diag) => diag.baselineStatus !== 'baselined')
            .forEach((diag) => {
                const severity = convertCategoryToSeverity(diag.category);
                const rule = diag.getRule();
                const code = this.getDiagCode(diag, rule);
                const vsDiag = Diagnostic.create(
                    diag.range,
                    diag.message,
                    severity,
                    code,
                    this.serverOptions.productName
                );

                if (
                    diag.category === DiagnosticCategory.UnusedCode ||
                    diag.category === DiagnosticCategory.UnreachableCode
                ) {
                    vsDiag.tags = [DiagnosticTag.Unnecessary];
                    vsDiag.severity = DiagnosticSeverity.Hint;

                    // If the client doesn't support "unnecessary" tags, don't report unused code.
                    if (!this.client.supportsUnnecessaryDiagnosticTag) {
                        return;
                    }
                } else if (diag.category === DiagnosticCategory.Deprecated) {
                    vsDiag.tags = [DiagnosticTag.Deprecated];
                    vsDiag.severity = DiagnosticSeverity.Hint;

                    // If the client doesn't support "deprecated" tags, don't report.
                    if (!this.client.supportsDeprecatedDiagnosticTag) {
                        return;
                    }
                } else if (diag.category === DiagnosticCategory.TaskItem) {
                    // TaskItem is not supported.
                    return;
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
                                Location.create(convertUriToLspUriString(fs, info.uri), info.range),
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

                case DiagnosticCategory.UnusedCode:
                case DiagnosticCategory.UnreachableCode:
                case DiagnosticCategory.Deprecated:
                    return DiagnosticSeverity.Hint;
            }
        }

        return convertedDiags;
    }
}
