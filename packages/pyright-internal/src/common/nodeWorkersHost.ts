import {
    parentPort,
    MessagePort as WorkerThreadsMessagePort,
    Worker as WorkerThreadsWorker,
    MessageChannel as WorkerThreadsMessageChannel,
    threadId,
} from 'worker_threads';
import { MessageChannel, MessagePort, shallowReplace, Transferable, Worker, WorkersHost } from './workersHost';

export class NodeWorkersHost implements WorkersHost {
    threadId(): string {
        return threadId.toString();
    }

    parentPort(): MessagePort | null {
        return parentPort ? new NodeMessagePort(parentPort) : null;
    }

    createWorker(initialData?: any): Worker {
        // this will load this same file in BG thread and start listener
        const worker = new WorkerThreadsWorker(__filename, { workerData: initialData });
        return new NodeWorker(worker);
    }

    createMessageChannel(): MessageChannel {
        const channel = new WorkerThreadsMessageChannel();
        return {
            port1: new NodeMessagePort(channel.port1),
            port2: new NodeMessagePort(channel.port2),
        };
    }
}

class NodeMessagePort implements MessagePort {
    constructor(private _delegate: WorkerThreadsMessagePort) {}
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
        this._delegate.on(type, (data) => listener(wrapOnReceive(data)));
    }
    start() {
        this._delegate.start();
    }
    close() {
        this._delegate.close();
    }
}

class NodeWorker implements Worker {
    constructor(private _delegate: WorkerThreadsWorker) {}
    postMessage(value: any, transferList?: Transferable[]): void {
        if (transferList) {
            this._delegate.postMessage(unwrapForSend(value), unwrapForSend(transferList));
        } else {
            this._delegate.postMessage(value);
        }
    }
    on(type: 'message' | 'error' | 'exit', listener: (data: any) => void): void {
        this._delegate.on(type, (data) => listener(wrapOnReceive(data)));
    }
    terminate = () => this._delegate.terminate();
}

function unwrapForSend(value: any): any {
    return shallowReplace(value, (v: any) => {
        return v instanceof NodeMessagePort ? v.unwrap() : v;
    });
}

function wrapOnReceive(value: any): any {
    return shallowReplace(value, (v: any) => {
        return v instanceof WorkerThreadsMessagePort ? new NodeMessagePort(v) : v;
    });
}
