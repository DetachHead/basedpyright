import { githubRepo } from 'pyright-internal/constants';
import {
    ExtensionContext,
    ExtensionMode,
    OutputChannel,
    Position,
    TextEdit,
    TextEditor,
    TextEditorEdit,
    Uri,
    WorkspaceConfiguration,
    commands,
    env,
    extensions,
    window,
    workspace,
    Range,
} from 'vscode';
import { FileBasedCancellationStrategy } from './cancellationUtils';
import {
    CancellationToken,
    ConfigurationParams,
    ConfigurationRequest,
    DidChangeConfigurationNotification,
    LanguageClientOptions,
    ResponseError,
    LanguageClient as BrowserLanguageClient,
} from 'vscode-languageclient/browser';
import { isThenable } from 'pyright-internal/common/core';
import { LanguageClient as NodeLanguageClient } from 'vscode-languageclient/node';
import { Commands } from 'pyright-internal/commands/commands';

type Client = NodeLanguageClient | BrowserLanguageClient;

const pythonPathChangedListenerMap = new Map<string, string>();

export const checkPylanceAndConflictingSettings = async () => {
    const pyrightLanguageServerEnabled = !workspace.getConfiguration('basedpyright').get('disableLanguageServices');
    const languageServerSetting = workspace.getConfiguration('python').get('languageServer');
    const moreInfo = 'More info';
    const disableBasedPyrightLsp = () =>
        workspace.getConfiguration('basedpyright').update('disableLanguageServices', true);
    if (pyrightLanguageServerEnabled && languageServerSetting !== 'None') {
        const disablePythonLanguageServer = 'fix setting & use basedpyright LSP (recommended)';
        const keepUsingExistingLanguageServer = `disable basedpyright LSP`;
        const result = await window.showWarningMessage(
            `basedpyright has detected that \`python.languageServer\` is set to "${languageServerSetting}". This setting conflicts with basedpyright's language server and should be disabled.`,
            { modal: true },
            disablePythonLanguageServer,
            keepUsingExistingLanguageServer,
            moreInfo
        );
        if (result === disablePythonLanguageServer) {
            void workspace.getConfiguration('python').update('languageServer', 'None');
        } else if (result === keepUsingExistingLanguageServer) {
            void disableBasedPyrightLsp();
        } else if (result === moreInfo) {
            void env.openExternal(Uri.parse(`${githubRepo}/#usage`));
        }
    }
    // See if Pylance is installed. If so, make sure its config doesn't conflict with basedpyright's
    const pylanceIsInstalled = extensions.getExtension('ms-python.vscode-pylance');
    if (pylanceIsInstalled) {
        const pylanceTypeCheckingEnabled =
            workspace.getConfiguration('python.analysis').get('typeCheckingMode') !== 'off';
        if (pylanceTypeCheckingEnabled || pyrightLanguageServerEnabled) {
            const problems: (() => void)[] = [];
            if (pylanceTypeCheckingEnabled) {
                problems.push(() => workspace.getConfiguration('python.analysis').update('typeCheckingMode', 'off'));
            }
            if (pyrightLanguageServerEnabled) {
                problems.push(disableBasedPyrightLsp);
            }
            if (problems.length > 0) {
                const uninstallPylance = 'Uninstall Pylance & restart vscode (recommended)';
                const fixSettings = `Fix settings & keep both extensions`;
                const result = await window.showWarningMessage(
                    'basedpyright has detected that the Pylance extension is installed and conflicting settings are enabled.',
                    { modal: true },
                    uninstallPylance,
                    fixSettings,
                    moreInfo
                );
                if (result === uninstallPylance) {
                    void commands
                        .executeCommand('workbench.extensions.uninstallExtension', 'ms-python.vscode-pylance')
                        // can't use await  because this uses sussy `Thenable` type which doesn't work with it
                        .then(() => commands.executeCommand('workbench.action.reloadWindow'));
                } else if (result === moreInfo) {
                    void env.openExternal(Uri.parse(`${githubRepo}/#using-basedpyright-with-pylance-not-recommended`));
                } else if (result !== undefined) {
                    problems.forEach((problem) => problem());
                }
            }
        }
    }
};

export const getClientOptions = (
    //cringe. this is only a function because client and clientOptions depend on each other in extension.ts
    // so it needs to be lazily evaluated
    clientGetter: () => Client,
    cancellationStrategy: FileBasedCancellationStrategy
): LanguageClientOptions => ({
    // Register the server for python source files.
    documentSelector: [
        { scheme: 'file', language: 'python' },
        { scheme: 'untitled', language: 'python' },
    ],
    synchronize: {
        // Synchronize the setting section to the server.
        configurationSection: ['python', 'basedpyright'],
    },
    connectionOptions: { cancellationStrategy: cancellationStrategy },
    middleware: {
        // Use the middleware hook to override the configuration call. This allows
        // us to inject the proper "python.pythonPath" setting from the Python extension's
        // private settings store.
        workspace: {
            configuration: async (
                params: ConfigurationParams,
                token: CancellationToken,
                next: ConfigurationRequest.HandlerSignature
            ) => {
                let result = next(params, token);
                if (isThenable(result)) {
                    result = await result;
                }
                if (result instanceof ResponseError) {
                    return result;
                }

                for (const [i, item] of params.items.entries()) {
                    if (item.section === 'basedpyright.analysis') {
                        const analysisConfig = workspace.getConfiguration(
                            item.section,
                            item.scopeUri ? Uri.parse(item.scopeUri) : undefined
                        );

                        // If stubPath is not set, remove it rather than sending default value.
                        // This lets the server know that it's unset rather than explicitly
                        // set to the default value (typings) so it can behave differently.
                        if (!isConfigSettingSetByUser(analysisConfig, 'stubPath')) {
                            delete (result[i] as any).stubPath;
                        }
                    }
                }

                // For backwards compatibility, set python.pythonPath to the configured
                // value as though it were in the user's settings.json file.
                const addPythonPath = (settings: any[]): Promise<any[]> => {
                    const pythonPathPromises: Promise<string | undefined>[] = params.items.map((item) => {
                        if (item.section === 'python') {
                            const uri = item.scopeUri ? Uri.parse(item.scopeUri) : undefined;
                            const client = clientGetter();
                            return getPythonPathFromPythonExtension(client.outputChannel, uri, () => {
                                // Posts a "workspace/didChangeConfiguration" message to the service
                                // so it re-queries the settings for all workspaces.
                                void client.sendNotification(DidChangeConfigurationNotification.type, {
                                    settings: null,
                                });
                            });
                        }
                        return Promise.resolve(undefined);
                    });

                    return Promise.all(pythonPathPromises).then((pythonPaths) => {
                        pythonPaths.forEach((pythonPath, i) => {
                            // If there is a pythonPath returned by the Python extension,
                            // always prefer this over the pythonPath that uses the old
                            // mechanism.
                            if (pythonPath !== undefined) {
                                settings[i].pythonPath = pythonPath;
                            }
                        });
                        return settings;
                    });
                };

                return addPythonPath(result);
            },
        },
    },
});

// The VS Code Python extension manages its own internal store of configuration settings.
// The setting that was traditionally named "python.pythonPath" has been moved to the
// Python extension's internal store for reasons of security and because it differs per
// project and by user.
async function getPythonPathFromPythonExtension(
    outputChannel: OutputChannel,
    scopeUri: Uri | undefined,
    postConfigChanged: () => void
): Promise<string | undefined> {
    try {
        const extension = extensions.getExtension('ms-python.python');
        if (!extension) {
            outputChannel.appendLine('Python extension not found');
        } else {
            if (extension.packageJSON?.featureFlags?.usingNewInterpreterStorage) {
                if (!extension.isActive) {
                    outputChannel.appendLine('Waiting for Python extension to load');
                    await extension.activate();
                    outputChannel.appendLine('Python extension loaded');
                }

                const execDetails = await extension.exports.settings.getExecutionDetails(scopeUri);
                let result: string | undefined;
                if (execDetails.execCommand && execDetails.execCommand.length > 0) {
                    result = execDetails.execCommand[0];
                }

                if (extension.exports.settings.onDidChangeExecutionDetails) {
                    installPythonPathChangedListener(
                        extension.exports.settings.onDidChangeExecutionDetails,
                        scopeUri,
                        postConfigChanged
                    );
                }

                if (!result) {
                    outputChannel.appendLine(`No pythonPath provided by Python extension`);
                } else {
                    outputChannel.appendLine(`Received pythonPath from Python extension: ${result}`);
                }

                return result;
            }
        }
    } catch (error) {
        outputChannel.appendLine(
            `Exception occurred when attempting to read pythonPath from Python extension: ${JSON.stringify(error)}`
        );
    }

    return undefined;
}
function installPythonPathChangedListener(
    onDidChangeExecutionDetails: (callback: () => void) => void,
    scopeUri: Uri | undefined,
    postConfigChanged: () => void
) {
    const uriString = scopeUri ? scopeUri.toString() : '';

    // No need to install another listener for this URI if
    // it already exists.
    if (pythonPathChangedListenerMap.has(uriString)) {
        return;
    }

    onDidChangeExecutionDetails(() => {
        postConfigChanged();
    });

    pythonPathChangedListenerMap.set(uriString, uriString);
}

function isConfigSettingSetByUser(configuration: WorkspaceConfiguration, setting: string): boolean {
    const inspect = configuration.inspect(setting);
    if (inspect === undefined) {
        return false;
    }

    return (
        inspect.globalValue !== undefined ||
        inspect.workspaceValue !== undefined ||
        inspect.workspaceFolderValue !== undefined ||
        inspect.globalLanguageValue !== undefined ||
        inspect.workspaceLanguageValue !== undefined ||
        inspect.workspaceFolderLanguageValue !== undefined
    );
}

export const registerCommands = (client: Client, context: ExtensionContext) => {
    // Register our custom commands.
    const textEditorCommands = [Commands.orderImports];
    textEditorCommands.forEach((commandName) => {
        context.subscriptions.push(
            commands.registerTextEditorCommand(
                commandName,
                (editor: TextEditor, edit: TextEditorEdit, ...args: any[]) => {
                    const cmd = {
                        command: commandName,
                        arguments: [editor.document.uri.toString(), ...args],
                    };

                    void client.sendRequest<TextEdit[] | undefined>('workspace/executeCommand', cmd).then((edits) => {
                        if (edits && edits.length > 0) {
                            void editor.edit((editBuilder) => {
                                edits.forEach((edit) => {
                                    const startPos = new Position(edit.range.start.line, edit.range.start.character);
                                    const endPos = new Position(edit.range.end.line, edit.range.end.character);
                                    const range = new Range(startPos, endPos);
                                    editBuilder.replace(range, edit.newText);
                                });
                            });
                        }
                    });
                },
                () => {
                    // Error received. For now, do nothing.
                }
            )
        );
    });

    const genericCommands = [Commands.createTypeStub, Commands.restartServer];
    genericCommands.forEach((command) => {
        context.subscriptions.push(
            commands.registerCommand(command, (...args: any[]) => {
                void client.sendRequest('workspace/executeCommand', { command, arguments: args });
            })
        );
    });

    // Register the debug only commands when running under the debugger.
    if (context.extensionMode === ExtensionMode.Development) {
        // Create a 'when' context for development.
        void commands.executeCommand('setContext', 'pyright.development', true);

        // Register the commands that only work when in development mode.
        context.subscriptions.push(
            commands.registerCommand(Commands.dumpTokens, () => {
                const uri = window.activeTextEditor?.document.uri.toString();
                if (uri) {
                    void client.sendRequest('workspace/executeCommand', {
                        command: Commands.dumpFileDebugInfo,
                        arguments: [uri, 'tokens'],
                    });
                }
            })
        );

        context.subscriptions.push(
            commands.registerCommand(Commands.dumpNodes, () => {
                const uri = window.activeTextEditor?.document.uri.toString();
                if (uri) {
                    void client.sendRequest('workspace/executeCommand', {
                        command: Commands.dumpFileDebugInfo,
                        arguments: [uri, 'nodes'],
                    });
                }
            })
        );

        context.subscriptions.push(
            commands.registerCommand(Commands.dumpTypes, () => {
                const uri = window.activeTextEditor?.document.uri.toString();
                if (uri) {
                    const start = window.activeTextEditor!.selection.start;
                    const end = window.activeTextEditor!.selection.end;
                    const startOffset = window.activeTextEditor!.document.offsetAt(start);
                    const endOffset = window.activeTextEditor!.document.offsetAt(end);
                    void client.sendRequest('workspace/executeCommand', {
                        command: Commands.dumpFileDebugInfo,
                        arguments: [uri, 'types', startOffset, endOffset],
                    });
                }
            })
        );
        context.subscriptions.push(
            commands.registerCommand(Commands.dumpCachedTypes, () => {
                const uri = window.activeTextEditor?.document.uri.toString();
                if (uri) {
                    const start = window.activeTextEditor!.selection.start;
                    const end = window.activeTextEditor!.selection.end;
                    const startOffset = window.activeTextEditor!.document.offsetAt(start);
                    const endOffset = window.activeTextEditor!.document.offsetAt(end);
                    void client.sendRequest('workspace/executeCommand', {
                        command: Commands.dumpFileDebugInfo,
                        arguments: [uri, 'cachedtypes', startOffset, endOffset],
                    });
                }
            })
        );
        context.subscriptions.push(
            commands.registerCommand(Commands.dumpCodeFlowGraph, () => {
                const uri = window.activeTextEditor?.document.uri.toString();
                if (uri) {
                    const start = window.activeTextEditor!.selection.start;
                    const startOffset = window.activeTextEditor!.document.offsetAt(start);
                    void client.sendRequest('workspace/executeCommand', {
                        command: Commands.dumpFileDebugInfo,
                        arguments: [uri, 'codeflowgraph', startOffset],
                    });
                }
            })
        );
    }
};
