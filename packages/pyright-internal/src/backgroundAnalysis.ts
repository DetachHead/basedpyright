/*
 * backgroundAnalysis.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * run analyzer from background thread
 */

import { workerData } from 'worker_threads';

import { ImportResolver } from './analyzer/importResolver';
import { BackgroundAnalysisBase, BackgroundAnalysisRunnerBase } from './backgroundAnalysisBase';
import { InitializationData } from './backgroundThreadBase';
import { getCancellationFolderName } from './common/cancellationUtils';
import { ConfigOptions } from './common/configOptions';
import { ConsoleInterface } from './common/console';
import { FileSystem } from './common/fileSystem';
import { createFromRealFileSystem } from './common/realFileSystem';
import { createWorker, parentPort } from './common/workersHost';
import { FullAccessHost } from './common/fullAccessHost';
import { Host } from './common/host';

export class BackgroundAnalysis extends BackgroundAnalysisBase {
    constructor(console: ConsoleInterface) {
        super(console);

        const initialData: InitializationData = {
            rootDirectory: (global as any).__rootDirectory as string,
            cancellationFolderName: getCancellationFolderName(),
            runner: undefined,
        };
        const worker = createWorker(initialData);
        this.setup(worker);
    }
}

export class BackgroundAnalysisRunner extends BackgroundAnalysisRunnerBase {
    constructor() {
        super(parentPort(), workerData as InitializationData);
    }
    protected createRealFileSystem(): FileSystem {
        return createFromRealFileSystem(this.getConsole());
    }

    protected override createHost(): Host {
        return new FullAccessHost(this.fs);
    }

    protected override createImportResolver(fs: FileSystem, options: ConfigOptions, host: Host): ImportResolver {
        return new ImportResolver(fs, options, host);
    }
}
