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
import { FileSystem } from './common/fileSystem';
import { createFromRealFileSystem, RealTempFile } from './common/realFileSystem';
import { createWorker, parentPort } from './common/workersHost';
import { FullAccessHost } from './common/fullAccessHost';
import { Host } from './common/host';
import { ServiceProvider } from './common/serviceProvider';
import { getRootUri } from './common/uri/uriUtils';
import { ServiceKeys } from './common/serviceKeys';

export class BackgroundAnalysis extends BackgroundAnalysisBase {
    private static _workerIndex = 0;

    constructor(serviceProvider: ServiceProvider) {
        super(serviceProvider.console());

        const index = ++BackgroundAnalysis._workerIndex;
        const initialData: InitializationData = {
            rootUri: getRootUri(serviceProvider)?.toString() ?? '',
            serviceId: index.toString(),
            cancellationFolderName: getCancellationFolderName(),
            runner: undefined,
            workerIndex: index,
        };
        const worker = createWorker(initialData);
        this.setup(worker);

        // Tell the cacheManager we have a worker that needs to share data.
        serviceProvider.cacheManager()?.addWorker(initialData.workerIndex, worker);
    }
}

export class BackgroundAnalysisRunner extends BackgroundAnalysisRunnerBase {
    constructor(serviceProvider: ServiceProvider) {
        super(parentPort(), workerData as InitializationData, serviceProvider);
    }
    protected createRealFileSystem(): FileSystem {
        return createFromRealFileSystem(
            this.serviceProvider.get(ServiceKeys.caseSensitivityDetector),
            this.getConsole()
        );
    }

    protected override createRealTempFile = () => new RealTempFile();

    protected override createHost(): Host {
        return new FullAccessHost(this.getServiceProvider());
    }

    protected override createImportResolver(
        serviceProvider: ServiceProvider,
        options: ConfigOptions,
        host: Host
    ): ImportResolver {
        return new ImportResolver(serviceProvider, options, host);
    }
}
