import {
    Transferable,
    WorkersHost,
    Worker,
    MessagePort,
    MessageChannel,
    shallowReplace,
} from 'pyright-internal/common/workersHost';

export class BrowserWorkersHost implements WorkersHost {
    private _parentPort: globalThis.MessagePort | undefined;

    constructor(parentPort?: globalThis.MessagePort) {
        this._parentPort = parentPort;
    }

    threadId(): string {
        return self.name;
    }

    parentPort(): MessagePort | null {
        return this._parentPort ? new BrowserMessagePort(this._parentPort) : null;
    }

    createWorker(initialData?: any): Worker {
        const channel = new globalThis.MessageChannel();
        self.postMessage(
            {
                type: 'browser/newWorker',
                initialData,
                port: channel.port1,
            },
            [channel.port1]
        );
        channel.port1.start();
        channel.port2.start();
        return new BrowserMessagePort(channel.port2);
    }

    createMessageChannel(): MessageChannel {
        const channel = new globalThis.MessageChannel();
        return {
            port1: new BrowserMessagePort(channel.port1),
            port2: new BrowserMessagePort(channel.port2),
        };
    }
}

class BrowserMessagePort implements MessagePort, Worker {
    constructor(private _delegate: globalThis.MessagePort) {}
    unwrap() {
        return this._delegate;
    }
    postMessage(value: any, transferList?: Transferable[]): void {
        if (transferList) {
            this._delegate.postMessage(unwrapForSend(value), unwrapForSend(transferList));
        } else {
            this._delegate.postMessage(value);
        }
    }
    on(type: 'message' | 'error' | 'exit', listener: (data: any) => void): void {
        // We don't support error/exit for now.
        if (type === 'message') {
            this._delegate.addEventListener(type, (e: MessageEvent) => {
                const data = e.data;
                listener(wrapOnReceive(data));
            });
        }
    }
    start() {
        this._delegate.start();
    }
    close() {
        this._delegate.close();
    }
    terminate = () => {
        console.warn('Worker.terminate was called. TODO: figure out what to do');
        this._delegate.close(); // this?
        return Promise.resolve(0);
    };
}

function unwrapForSend(value: any): any {
    return shallowReplace(value, (v: any) => {
        return v instanceof BrowserMessagePort ? v.unwrap() : v;
    });
}

function wrapOnReceive(value: any): any {
    return shallowReplace(value, (v: any) => {
        return v instanceof globalThis.MessagePort ? new BrowserMessagePort(v) : v;
    });
}
