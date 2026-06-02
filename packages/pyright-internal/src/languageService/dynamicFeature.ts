/*
 * dynamicFeature.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * LanguageServer features that can be dynamically added or removed from LSP server
 */
import { Connection, Disposable, RegistrationType } from 'vscode-languageserver';
import { ServerSettings } from '../common/languageServerInterface';

export abstract class DynamicFeature<T> {
    private _lastRegistration: { disposable?: Disposable; key?: string } = {};
    protected abstract type: RegistrationType<T>;

    constructor(readonly name: string, private readonly _connection: Connection) {
        // Empty
    }

    register() {
        this._registerFeature().then((d) => {
            if (!d) {
                return;
            }
            this.dispose();
            this._lastRegistration.disposable = d;
        });
    }

    update(settings: ServerSettings) {
        // Default is no-op
    }

    /** Unregister the current registration. Called internally by register() to clean up before re-registering. */
    dispose() {
        this._lastRegistration.disposable?.dispose();
        this._lastRegistration = {};
    }

    /** Fully disable this feature so it can be re-enabled on the next update(). */
    disable() {
        this.dispose();
    }

    /**
     * create the options for the feature to be registered, along with a `key` which is used to identify and prevent duplicate re-registrations
     */
    protected abstract featureOptions(): { options: T; key: string };

    private async _registerFeature() {
        const { options, key } = this.featureOptions();
        if (key !== this._lastRegistration.key) {
            this._lastRegistration.key = key;
            return this._connection.client.register(this.type, options);
        }
        return undefined;
    }
}

export class DynamicFeatures {
    private readonly _map = new Map<string, DynamicFeature<unknown>>();

    add(feature: DynamicFeature<unknown>) {
        const old = this._map.get(feature.name);
        if (old) {
            old.dispose();
        }

        this._map.set(feature.name, feature);
    }

    update(settings: ServerSettings) {
        for (const feature of this._map.values()) {
            feature.update(settings);
        }
    }

    register() {
        for (const feature of this._map.values()) {
            feature.register();
        }
    }

    unregister() {
        for (const feature of this._map.values()) {
            feature.dispose();
        }

        this._map.clear();
    }
}
