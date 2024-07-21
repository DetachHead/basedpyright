// This could be a more general abstraction of the host environment but for
// now it's focussed on abstracting worker_threads vs Web Workers.
//
// For minimal distruption to the existing NodeJS code we use Node-type
// events rather than MessageEvent.

export type Transferable = ArrayBuffer | MessagePort;

export interface MessageSourceSink {
    // As per worker_thread, except any transferables may only be
    // `value` itself or one level nested in an object or array value.
    postMessage(value: any, transferList?: Transferable[]): void;
    on(type: 'message' | 'error' | 'exit', listener: (data: any) => void): void;
}

export interface MessagePort extends MessageSourceSink {
    start(): void;
    close(): void;
}

export interface MessageChannel {
    port1: MessagePort;
    port2: MessagePort;
}

export interface WorkersHost {
    parentPort(): MessagePort | null;
    createWorker(initialData?: any): MessageSourceSink;
    createMessageChannel(): MessageChannel;
    threadId(): string;
}

let _host: undefined | WorkersHost;

// This must be called by host-specific entry points.
export function initializeWorkersHost(host: WorkersHost) {
    _host = host;
}

function host(): WorkersHost {
    if (!_host) {
        throw new Error('Host must be initialized');
    }
    return _host;
}

export function createMessageChannel(): MessageChannel {
    return host().createMessageChannel();
}

export function createWorker(initialData?: any): MessageSourceSink {
    return host().createWorker(initialData);
}

export function parentPort(): MessagePort | null {
    return host().parentPort();
}

export function threadId(): string {
    return host().threadId();
}

export function isMainThread(): boolean {
    return !parentPort();
}

// Utility function for implementations for wrapping/unwrapping of transferable values.
export function shallowReplace(value: any, mapper: (v: any) => any) {
    if (Array.isArray(value)) {
        return value.map(mapper);
    }
    if (isPlainObject(value)) {
        const shallowCopy = Object.create(null);
        Object.entries(value).forEach(([k, v]) => {
            shallowCopy[k] = mapper(v);
        });
        return shallowCopy;
    }
    return mapper(value);
}

function isPlainObject(v: any): boolean {
    return Object.prototype.toString.call(v) === '[object Object]';
}
