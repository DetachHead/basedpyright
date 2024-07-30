/*
 * main.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Provides the main entrypoint to the test server when running in Node.
 */

import { NodeWorkersHost } from '../../common/nodeWorkersHost';
import { initializeWorkersHost } from '../../common/workersHost';
import { run } from './languageServer';

initializeWorkersHost(new NodeWorkersHost());

run();
