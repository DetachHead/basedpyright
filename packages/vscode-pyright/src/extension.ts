/*
 * extension.ts
 *
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Provides client for Pyright Python language server. This portion runs
 * in the context of the VS Code process and talks to the server, which
 * runs in another process.
 */

import 'pyright-internal/globals';

import { PythonExtension } from '@vscode/python-extension';
import os from 'os';
import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import { LanguageClient, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { FileBasedCancellationStrategy } from './cancellationUtils';
import { toolName } from 'pyright-internal/constants';
import { checkPylanceAndConflictingSettings, getClientOptions, registerCommands } from './extensionUtils';
import { existsSync } from 'fs';
import { cp } from 'fs/promises';

let cancellationStrategy: FileBasedCancellationStrategy | undefined;

let languageClient: LanguageClient | undefined;

// Request a heap size of 3GB. This is reasonable for modern systems.
const defaultHeapSize = 3072;

export async function activate(context: ExtensionContext) {
    void checkPylanceAndConflictingSettings();

    cancellationStrategy = new FileBasedCancellationStrategy();
    let serverOptions: ServerOptions | undefined = undefined;
    if (workspace.getConfiguration('basedpyright').get('importStrategy') === 'fromEnvironment') {
        const pythonApi = await PythonExtension.api();
        const executableName = `basedpyright-langserver${os.platform() === 'win32' ? '.exe' : ''}`;
        const executableDir = path.join(pythonApi.environments.getActiveEnvironmentPath().path, '..');
        const executablePath = path.join(executableDir, executableName);
        if (existsSync(executablePath)) {
            console.log('using pyright executable:', executablePath);

            // make a copy of the exe to avoid locking it, which would otherwise cause crashes when you try to
            // update/uninstall basedpyright while vscode is open
            let copiedExecutablePath = path.join(executableDir, `_vscode_copy_${executableName}`);
            try {
                await cp(executablePath, copiedExecutablePath, { force: true });
            } catch (e) {
                console.warn(`failed to create copy at ${copiedExecutablePath}, falling back to using the real one`);
                copiedExecutablePath = executablePath;
            }
            serverOptions = {
                command: copiedExecutablePath,
                transport: TransportKind.stdio,
                args: cancellationStrategy.getCommandLineArguments(),
            };
        } else {
            console.warn('failed to find pyright executable, falling back to bundled:', executablePath);
        }
    }
    if (!serverOptions) {
        console.log('using bundled pyright');
        const bundlePath = context.asAbsolutePath(path.join('dist', 'server.js'));

        const runOptions = { execArgv: [`--max-old-space-size=${defaultHeapSize}`] };
        const debugOptions = { execArgv: ['--nolazy', '--inspect=6600', `--max-old-space-size=${defaultHeapSize}`] };

        // If the extension is launched in debug mode, then the debug server options are used.
        serverOptions = {
            run: {
                module: bundlePath,
                transport: TransportKind.ipc,
                args: cancellationStrategy.getCommandLineArguments(),
                options: runOptions,
            },
            // In debug mode, use the non-bundled code if it's present. The production
            // build includes only the bundled package, so we don't want to crash if
            // someone starts the production extension in debug mode.
            debug: {
                module: bundlePath,
                transport: TransportKind.ipc,
                args: cancellationStrategy.getCommandLineArguments(),
                options: debugOptions,
            },
        };
    }

    // Options to control the language client
    const clientOptions = getClientOptions(() => client, cancellationStrategy);

    // Create the language client and start the client.
    const client = new LanguageClient('python', toolName, serverOptions, clientOptions);
    languageClient = client;

    registerCommands(client, context);
    await client.start();
}

export function deactivate() {
    if (cancellationStrategy) {
        cancellationStrategy.dispose();
        cancellationStrategy = undefined;
    }

    const client = languageClient;
    languageClient = undefined;

    return client?.stop();
}
