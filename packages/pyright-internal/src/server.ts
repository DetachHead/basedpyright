/*
 * server.ts
 *
 * Implements pyright language server.
 */

import { Connection } from 'vscode-languageserver';

import { BackgroundAnalysis } from './backgroundAnalysis';
import { BackgroundAnalysisBase } from './backgroundAnalysisBase';
import { getCancellationFolderName } from './common/cancellationUtils';
import { ConsoleWithLogLevel } from './common/console';
import { isDebugMode } from './common/core';
import { FileBasedCancellationProvider } from './common/fileBasedCancellationUtils';
import { FileSystem } from './common/fileSystem';
import { FullAccessHost } from './common/fullAccessHost';
import { Host } from './common/host';
import { RealTempFile, WorkspaceFileWatcherProvider, createFromRealFileSystem } from './common/realFileSystem';
import { RealLanguageServer } from './realLanguageServer';

export class PyrightServer extends RealLanguageServer {
    constructor(connection: Connection, maxWorkers: number, realFileSystem?: FileSystem) {
        const tempFile = new RealTempFile();
        const console = new ConsoleWithLogLevel(connection.console);
        const fileWatcherProvider = new WorkspaceFileWatcherProvider();
        const fileSystem = realFileSystem ?? createFromRealFileSystem(tempFile, console, fileWatcherProvider);
        super(
            connection,
            maxWorkers,
            fileSystem,
            new FileBasedCancellationProvider('bg'),
            tempFile,
            fileWatcherProvider
        );
    }

    override createBackgroundAnalysis(serviceId: string): BackgroundAnalysisBase | undefined {
        if (isDebugMode() || !getCancellationFolderName()) {
            // Don't do background analysis if we're in debug mode or an old client
            // is used where cancellation is not supported.
            return undefined;
        }

        return new BackgroundAnalysis(this.serverOptions.serviceProvider);
    }

    protected override createHost(): Host {
        return new FullAccessHost(this.serverOptions.serviceProvider);
    }
}
