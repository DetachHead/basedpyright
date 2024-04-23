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

import { ExtensionContext } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/browser';
import { FileBasedCancellationStrategy } from './cancellationUtils';
import { toolName } from 'pyright-internal/constants';
import { checkPylanceAndConflictingSettings, getClientOptions, registerCommands } from './extensionUtils';
import path from 'path';

let cancellationStrategy: FileBasedCancellationStrategy | undefined;

let languageClient: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
    void checkPylanceAndConflictingSettings();

    cancellationStrategy = new FileBasedCancellationStrategy();
    // Options to control the language client
    const clientOptions = getClientOptions(() => client, cancellationStrategy);
    // Create the language client and start the client.
    const client = new LanguageClient(
        'python',
        toolName,
        clientOptions,
        new Worker(context.asAbsolutePath(path.join('dist', 'webServer.js')))
    );
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
