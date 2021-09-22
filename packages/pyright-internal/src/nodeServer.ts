/*
 * nodeServer.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Implements utilities for starting the language server in a node environment.
 */

import { Connection, ConnectionOptions } from 'vscode-languageserver';
import { createConnection } from 'vscode-languageserver/node';
import { initializeWorkersHost, isMainThread } from './common/workersHost';

import { getCancellationStrategyFromArgv } from './common/fileBasedCancellationUtils';
import { NodeWorkersHost } from './common/nodeWorkersHost';

initializeWorkersHost(new NodeWorkersHost());

export function run(runServer: (connection: Connection) => void, runBackgroundThread: () => void) {
    if (process.env.NODE_ENV === 'production') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('source-map-support').install();
    }

    if (isMainThread()) {
        runServer(createConnection(getConnectionOptions()));
    } else {
        runBackgroundThread();
    }
}

export function getConnectionOptions(): ConnectionOptions {
    return { cancellationStrategy: getCancellationStrategyFromArgv(process.argv) };
}
