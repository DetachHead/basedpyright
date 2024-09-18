/*
 * backgroundThreadBase.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * base class for background worker thread.
 */

import { CacheManager } from './analyzer/cacheManager';
import {
    getCancellationTokenId,
    OperationCanceledException,
    setCancellationFolderName,
} from './common/cancellationUtils';
import { BasedConfigOptions, ConfigOptions } from './common/configOptions';
import { ConsoleInterface, LogLevel } from './common/console';
import { Disposable, isThenable } from './common/core';
import * as debug from './common/debug';
import { FileSystem, TempFile } from './common/fileSystem';
import { ServiceKeys } from './common/serviceKeys';
import { ServiceProvider } from './common/serviceProvider';
import './common/serviceProviderExtensions';
import { Uri } from './common/uri/uri';
import { MessagePort } from './common/workersHost';
import { CaseSensitivityDetector } from './common/caseSensitivityDetector';
import { CancellationToken } from 'vscode-jsonrpc';
import { getCancellationTokenFromId } from './common/fileBasedCancellationUtils';

export class BackgroundConsole implements ConsoleInterface {
    private _level = LogLevel.Log;

    constructor(private _parentPort: MessagePort | null) {}

    get level() {
        return this._level;
    }

    set level(value: LogLevel) {
        this._level = value;
    }

    log(msg: string) {
        this.post(LogLevel.Log, msg);
    }

    info(msg: string) {
        this.post(LogLevel.Info, msg);
    }

    warn(msg: string) {
        this.post(LogLevel.Warn, msg);
    }

    error(msg: string) {
        this.post(LogLevel.Error, msg);
    }

    protected post(level: LogLevel, msg: string) {
        this._parentPort?.postMessage({ requestType: 'log', data: serialize({ level: level, message: msg }) });
    }
}

export abstract class BackgroundThreadBase {
    // Exposed for browser filesystem operations.
    // In future these should go via fs.
    protected realFs: FileSystem;
    protected readonly serviceProvider: ServiceProvider;

    constructor(protected parentPort: MessagePort | null, data: InitializationData, serviceProvider?: ServiceProvider) {
        setCancellationFolderName(data.cancellationFolderName);
        // Make sure there's a file system and a console interface.
        this.serviceProvider = serviceProvider ?? new ServiceProvider();
        if (!this.serviceProvider.tryGet(ServiceKeys.console)) {
            this.serviceProvider.add(ServiceKeys.console, new BackgroundConsole(this.parentPort));
        }

        let tempFile: (TempFile & CaseSensitivityDetector) | undefined = undefined;
        if (!this.serviceProvider.tryGet(ServiceKeys.tempFile)) {
            tempFile = this.createRealTempFile();
            this.serviceProvider.add(ServiceKeys.tempFile, tempFile);
        }
        if (!this.serviceProvider.tryGet(ServiceKeys.caseSensitivityDetector)) {
            this.serviceProvider.add(ServiceKeys.caseSensitivityDetector, tempFile ?? this.createRealTempFile());
        }
        this.realFs = this.createRealFileSystem();
        if (!this.serviceProvider.tryGet(ServiceKeys.fs)) {
            this.serviceProvider.add(ServiceKeys.fs, this.realFs);
        }
        if (!this.serviceProvider.tryGet(ServiceKeys.cacheManager)) {
            this.serviceProvider.add(ServiceKeys.cacheManager, new CacheManager());
        }
        // Stash the base directory into a global variable.
        (global as any).__rootDirectory = Uri.parse(data.rootUri, this.serviceProvider).getFilePath();
    }

    protected get fs() {
        return this.serviceProvider.fs();
    }

    // Hooks for Browser vs NodeJS file system.
    protected abstract createRealFileSystem(): FileSystem;
    protected abstract createRealTempFile(): TempFile & CaseSensitivityDetector;

    protected log(level: LogLevel, msg: string) {
        this.parentPort?.postMessage({ requestType: 'log', data: serialize({ level: level, message: msg }) });
    }

    protected getConsole() {
        return this.serviceProvider.console();
    }

    protected getServiceProvider() {
        return this.serviceProvider;
    }

    protected handleShutdown() {
        const tempFile = this.serviceProvider.tryGet(ServiceKeys.tempFile);
        if (Disposable.is(tempFile)) {
            tempFile.dispose();
        }

        this.parentPort?.close();
    }
}

// Function used to serialize specific types that can't automatically be serialized.
// Exposed here so it can be reused by a caller that wants to add more cases.
export function serializeReplacer(value: any) {
    if (Uri.is(value) && value.toJsonObj !== undefined) {
        return { __serialized_uri_val: value.toJsonObj() };
    }
    if (value instanceof Map) {
        return { __serialized_map_val: [...value] };
    }
    if (value instanceof Set) {
        return { __serialized_set_val: [...value] };
    }
    if (value instanceof RegExp) {
        return { __serialized_regexp_val: { source: value.source, flags: value.flags } };
    }
    if (value instanceof ConfigOptions) {
        const entries = Object.entries(value);
        return { __serialized_config_options: entries.reduce((obj, e, i) => ({ ...obj, [e[0]]: e[1] }), {}) };
    }
    if (CancellationToken.is(value)) {
        return { cancellation_token_val: getCancellationTokenId(value) ?? null };
    }

    return value;
}

export function serialize(obj: any): string {
    // Convert the object to a string so it can be sent across a message port.
    return JSON.stringify(obj, (k, v) => serializeReplacer(v));
}

export function deserializeReviver(value: any) {
    if (value && typeof value === 'object') {
        if (value.__serialized_uri_val !== undefined) {
            return Uri.fromJsonObj(value.__serialized_uri_val);
        }
        if (value.__serialized_map_val) {
            return new Map(value.__serialized_map_val);
        }
        if (value.__serialized_set_val) {
            return new Set(value.__serialized_set_val);
        }
        if (value.__serialized_regexp_val) {
            return new RegExp(value.__serialized_regexp_val.source, value.__serialized_regexp_val.flags);
        }
        if (value.__serialized_config_options) {
            const configOptions = new BasedConfigOptions(value.__serialized_config_options.projectRoot);
            Object.assign(configOptions, value.__serialized_config_options);
            return configOptions;
        }
        if (Object.keys(value).includes('cancellation_token_val')) {
            return getCancellationTokenFromId(value.cancellation_token_val);
        }
    }
    return value;
}

export function deserialize<T = any>(json: string | null): T {
    if (!json) {
        return undefined as any;
    }
    // Convert the string back to an object.
    return JSON.parse(json, (k, v) => deserializeReviver(v));
}

// TODO: whats this for? it came from a pylance commit that doesn't seem to be used for anything
//  that MessagePort can't do
// export interface MessagePoster {
//     postMessage(value: any, transferList?: ReadonlyArray<TransferListItem>): void;
// }

export function run<T = any>(code: () => Promise<T>, port: MessagePort): Promise<void>;
export function run<T = any>(code: () => Promise<T>, port: MessagePort, serializer: (obj: any) => any): Promise<void>;
export function run<T = any>(code: () => T, port: MessagePort): void;
export function run<T = any>(code: () => T, port: MessagePort, serializer: (obj: any) => any): void;
export function run<T = any>(
    code: () => T | Promise<T>,
    port: MessagePort,
    serializer = serialize
): void | Promise<void> {
    try {
        const result = code();
        if (!isThenable(result)) {
            port.postMessage({ kind: 'ok', data: serializer(result) });
            return;
        }

        return result.then(
            (r) => {
                port.postMessage({ kind: 'ok', data: serializer(r) });
            },
            (e) => {
                if (OperationCanceledException.is(e)) {
                    port.postMessage({ kind: 'cancelled', data: e.message });
                    return;
                }

                port.postMessage({ kind: 'failed', data: `Exception: ${e.message} in ${e.stack}` });
            }
        );
    } catch (e: any) {
        if (OperationCanceledException.is(e)) {
            port.postMessage({ kind: 'cancelled', data: e.message });
            return;
        }

        port.postMessage({ kind: 'failed', data: `Exception: ${e.message} in ${e.stack}` });
    }
}

export function getBackgroundWaiter<T>(port: MessagePort, deserializer: (v: any) => T = deserialize): Promise<T> {
    return new Promise((resolve, reject) => {
        port.on('message', (m: RequestResponse) => {
            switch (m.kind) {
                case 'ok':
                    resolve(deserializer(m.data));
                    break;

                case 'cancelled':
                    reject(new OperationCanceledException());
                    break;

                case 'failed':
                    reject(m.data);
                    break;

                default:
                    debug.fail(`unknown kind ${m.kind}`);
            }
        });
    });
}

export interface InitializationData {
    rootUri: string;
    serviceId: string;
    workerIndex: number;
    cancellationFolderName: string | undefined;
    runner: string | undefined;
}

export interface RequestResponse {
    kind: 'ok' | 'failed' | 'cancelled';
    data: any;
}

export interface LogData {
    level: LogLevel;
    message: string;
}
