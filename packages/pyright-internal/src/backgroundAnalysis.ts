/*
 * backgroundAnalysis.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * run analyzer from background thread
 */

import { workerData } from 'worker_threads';

import { BackgroundAnalysisBase, BackgroundAnalysisRunnerBase, InitializationData } from './backgroundAnalysisBase';
import { getCancellationFolderName } from './common/cancellationUtils';
import { ConsoleInterface } from './common/console';
import { FileSystem } from './common/fileSystem';
import { createFromRealFileSystem } from './common/realFileSystem';
import { createWorker, parentPort } from './common/workersHost';

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
}
