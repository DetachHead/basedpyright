import {
    Transferable,
    WorkersHost,
    MessageSourceSink,
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

    createWorker(initialData?: any): MessageSourceSink {
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

class BrowserMessagePort implements MessagePort {
    constructor(private delegate: globalThis.MessagePort) {}
    unwrap() {
        return this.delegate;
    }
    postMessage(value: any, transferList?: Transferable[]): void {
        if (transferList) {
            this.delegate.postMessage(unwrapForSend(value), unwrapForSend(transferList));
        } else {
            this.delegate.postMessage(value);
        }
    }
    on(type: 'message' | 'error' | 'exit', listener: (data: any) => void): void {
        // We don't support error/exit for now.
        if (type === 'message') {
            this.delegate.addEventListener(type, (e: MessageEvent) => {
                const data = e.data;
                listener(wrapOnReceive(data));
            });
        }
    }
    start() {
        this.delegate.start();
    }
    close() {
        this.delegate.close();
    }
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
