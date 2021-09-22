import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser';

import { BrowserBackgroundAnalysisRunner, PyrightServer } from './browser-server';
import { InitializationData } from 'pyright-internal/backgroundThreadBase';
import { initializeWorkersHost } from 'pyright-internal/common/workersHost';
import { BrowserWorkersHost } from './browserWorkersHost';

const ctx: DedicatedWorkerGlobalScope & { app: PyrightServer | BrowserBackgroundAnalysisRunner | undefined } =
    self as any;

interface BootParams {
    type: 'browser/boot';
    mode: 'foreground' | 'background';
    // Background only.
    initialData?: InitializationData;
    // Background only.
    port?: MessagePort;
}

// Ideally we'd use a nested worker for the background thread but no Safari support.
// Instead non-Worker code must facilitate the connection by creating a worker and
// passing on a port.
ctx.addEventListener('message', (e: MessageEvent) => {
    if (e.data.type === 'browser/boot') {
        const params = e.data as BootParams;
        const { mode, port, initialData } = params;
        try {
            if (mode === 'foreground') {
                initializeWorkersHost(new BrowserWorkersHost());
                ctx.app = new PyrightServer(
                    createConnection(new BrowserMessageReader(ctx), new BrowserMessageWriter(ctx))
                );
            } else if (mode === 'background') {
                if (!initialData) {
                    throw new Error('Missing "initialData" background boot parameter.');
                }
                if (!(port instanceof MessagePort)) {
                    throw new Error(`Invalid "port" parameter: ${port}`);
                }
                initializeWorkersHost(new BrowserWorkersHost(port));
                ctx.app = new BrowserBackgroundAnalysisRunner(initialData);
                ctx.app.start();
            } else {
                throw new Error(`Invalid "mode" boot parameter: ${mode}`);
            }
        } catch (e) {
            ctx.close();
            throw e;
        }
    }
});
