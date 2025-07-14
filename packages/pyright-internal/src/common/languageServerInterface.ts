/*
 * languageServerInterface.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Interface for language server
 */

import { MaxAnalysisTime } from '../analyzer/program';
import { IBackgroundAnalysis } from '../backgroundAnalysisBase';
import { InlayHintSettings, Workspace } from '../workspaceFactory';
import { DiagnosticBooleanOverridesMap, DiagnosticSeverityOverridesMap } from './commandLineOptions';
import { SignatureDisplayType } from './configOptions';
import { ConsoleInterface, LogLevel } from './console';
import { TaskListToken } from './diagnostic';
import { FileSystem, ReadOnlyFileSystem } from './fileSystem';
import { FileWatcherHandler } from './fileWatcher';
import { ServiceProvider } from './serviceProvider';
import { Uri } from './uri/uri';
import { FileDiagnostics } from './diagnosticSink';

export interface ServerSettings {
    venvPath?: Uri | undefined;
    pythonPath?: Uri | undefined;
    typeshedPath?: Uri | undefined;
    stubPath?: Uri | undefined;
    openFilesOnly?: boolean | undefined;
    typeCheckingMode?: string | undefined;
    useLibraryCodeForTypes?: boolean | undefined;
    baselineFile?: Uri | undefined;
    disableLanguageServices?: boolean | undefined;
    disableTaggedHints?: boolean | undefined;
    disableOrganizeImports?: boolean | undefined;
    autoSearchPaths?: boolean | undefined;
    extraPaths?: Uri[] | undefined;
    watchForSourceChanges?: boolean | undefined;
    watchForLibraryChanges?: boolean | undefined;
    watchForConfigChanges?: boolean | undefined;
    diagnosticSeverityOverrides?: DiagnosticSeverityOverridesMap | undefined;
    diagnosticBooleanOverrides?: DiagnosticBooleanOverridesMap | undefined;
    logLevel?: LogLevel | undefined;
    autoImportCompletions?: boolean | undefined;
    indexing?: boolean | undefined;
    logTypeEvaluationTime?: boolean | undefined;
    typeEvaluationTimeThreshold?: number | undefined;
    includeFileSpecs?: string[];
    excludeFileSpecs?: string[];
    ignoreFileSpecs?: string[];
    taskListTokens?: TaskListToken[];
    functionSignatureDisplay?: SignatureDisplayType | undefined;
    inlayHints?: InlayHintSettings;
    useTypingExtensions?: boolean;
    fileEnumerationTimeoutInSec?: number | undefined;
    autoFormatStrings?: boolean;
}

export interface MessageAction {
    title: string;
    [key: string]: string | boolean | number | object;
}

export interface WindowInterface {
    showErrorMessage(message: string): void;
    showErrorMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;

    showWarningMessage(message: string): void;
    showWarningMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;

    showInformationMessage(message: string): void;
    showInformationMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;
}

export namespace WindowInterface {
    export function is(obj: any): obj is WindowInterface {
        return (
            !!obj &&
            obj.showErrorMessage !== undefined &&
            obj.showWarningMessage !== undefined &&
            obj.showInformationMessage !== undefined
        );
    }
}

export interface WorkspaceServices {
    fs: FileSystem | undefined;
    backgroundAnalysis: IBackgroundAnalysis | undefined;
}

export interface ServerOptions {
    productName: string;
    rootDirectory: Uri;
    version: string;
    serviceProvider: ServiceProvider;
    fileWatcherHandler: FileWatcherHandler;
    maxAnalysisTimeInForeground?: MaxAnalysisTime;
    disableChecker?: boolean;
    supportedCommands?: string[];
    supportedCodeActions?: string[];
    supportsTelemetry?: boolean;
}

export interface LanguageServerBaseInterface {
    readonly console: ConsoleInterface;
    readonly window: WindowInterface;
    readonly supportAdvancedEdits: boolean;
    readonly serviceProvider: ServiceProvider;

    createBackgroundAnalysis(serviceId: string, workspaceRoot: Uri): IBackgroundAnalysis | undefined;
    reanalyze(): void;
    restart(): void;

    getWorkspaces(): Promise<Workspace[]>;
    getSettings(workspace: Workspace): Promise<ServerSettings>;
}

export interface LanguageServerInterface extends LanguageServerBaseInterface {
    getWorkspaceForFile(fileUri: Uri, pythonPath?: Uri): Promise<Workspace>;
    convertUriToLspUriString: (fs: ReadOnlyFileSystem, uri: Uri) => string;
    readonly documentsWithDiagnostics: Record<string, FileDiagnostics>;
}

export interface WindowService extends WindowInterface {
    createGoToOutputAction(): MessageAction;
    createOpenUriAction(title: string, uri: string): MessageAction;
}

export namespace WindowService {
    export function is(obj: any): obj is WindowService {
        return obj.createGoToOutputAction !== undefined && WindowInterface.is(obj);
    }
}

export interface CommandService {
    sendCommand(id: string, ...args: string[]): void;
}

export namespace CommandService {
    export function is(obj: any): obj is CommandService {
        return !!obj && obj.sendCommand !== undefined;
    }
}
