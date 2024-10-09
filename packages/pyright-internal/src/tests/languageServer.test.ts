/*
 * languageServer.test.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Tests to verify Pyright works as the backend for a language server.
 */

import assert from 'assert';
import {
    CancellationToken,
    CompletionRequest,
    ConfigurationItem,
    DiagnosticSeverity,
    InitializedNotification,
    InitializeRequest,
    MarkupContent,
    WillRenameFilesRequest,
} from 'vscode-languageserver';

import { convertOffsetToPosition } from '../common/positionUtils';
import { PythonVersion, pythonVersion3_10 } from '../common/pythonVersion';

import { isArray } from '../common/core';
import { normalizeSlashes } from '../common/pathUtils';
import {
    cleanupAfterAll,
    DEFAULT_WORKSPACE_ROOT,
    getParseResults,
    hover,
    initializeLanguageServer,
    openFile,
    PyrightServerInfo,
    runPyrightServer,
    waitForDiagnostics,
} from './lsp/languageServerTestUtils';

/** objects from `sendRequest` don't work with assertions and i cant figure out why */
const assertEqual = <T>(actual: T, expected: T) => expect(JSON.parse(JSON.stringify(actual))).toStrictEqual(expected);

describe(`Basic language server tests`, () => {
    let serverInfo: PyrightServerInfo | undefined;
    async function runLanguageServer(
        projectRoots: string[] | string,
        code: string,
        callInitialize = true,
        extraSettings?: { item: ConfigurationItem; value: any }[],
        pythonVersion: PythonVersion = pythonVersion3_10,
        supportsBackgroundThread?: boolean
    ) {
        const result = await runPyrightServer(
            projectRoots,
            code,
            callInitialize,
            extraSettings,
            pythonVersion,
            supportsBackgroundThread
        );
        serverInfo = result;
        return result;
    }

    afterEach(async () => {
        if (serverInfo) {
            await serverInfo.dispose();
            serverInfo = undefined;
        }
        await cleanupAfterAll();
    });

    test('Basic Initialize', async () => {
        const code = `
// @filename: test.py
//// # empty file
        `;
        const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, /* callInitialize */ false);

        const initializeResult = await initializeLanguageServer(serverInfo);

        assert(initializeResult);
        assert(initializeResult.capabilities.completionProvider?.resolveProvider);
    }, 10000);

    test('Initialize without workspace folder support', async () => {
        const code = `
// @filename: test.py
//// import [|/*marker*/os|]
        `;
        const info = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, /* callInitialize */ false);

        // This will test clients with no folder and configuration support.
        const params = info.getInitializeParams();
        params.capabilities.workspace!.workspaceFolders = false;
        params.capabilities.workspace!.configuration = false;

        // Perform LSP Initialize/Initialized handshake.
        const result = await info.connection.sendRequest(InitializeRequest.type, params, CancellationToken.None);
        assert(result);

        await info.connection.sendNotification(InitializedNotification.type, {});

        // Do simple hover request to verify our server works with a client that doesn't support
        // workspace folder/configuration capabilities.
        openFile(info, 'marker');
        const hoverResult = await hover(info, 'marker');
        assert(hoverResult);
        assert(MarkupContent.is(hoverResult.contents));
        assert.strictEqual(hoverResult.contents.value, '```python\n(module) os\n```');
    });
    test('Hover', async () => {
        const code = `
// @filename: test.py
//// import [|/*marker*/os|]
        `;
        const info = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, /* callInitialize */ true);

        // Do simple hover request
        openFile(info, 'marker');
        const hoverResult = await hover(info, 'marker');
        assert(hoverResult);
        assert(MarkupContent.is(hoverResult.contents));
        assert.strictEqual(hoverResult.contents.value, '```python\n(module) os\n```');
    });
    test('language server works when no workspace is open', async () => {
        const code = `
// @filename: test.py
//// import [|/*marker*/os|]
        `;
        const info = await runLanguageServer([], code, true);

        // Do simple hover request
        openFile(info, 'marker');
        const hoverResult = await hover(info, 'marker');
        assert(hoverResult);
        assert(MarkupContent.is(hoverResult.contents));
        assert.strictEqual(hoverResult.contents.value, '```python\n(module) os\n```');
    });
    test('Completions', async () => {
        const code = `
// @filename: test.py
//// import os
//// os.[|/*marker*/|]
        `;
        const info = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, /* callInitialize */ true);

        // Do simple completion request
        openFile(info, 'marker');
        const marker = info.testData.markerPositions.get('marker')!;
        const fileUri = marker.fileUri;
        const text = info.testData.files.find((d) => d.fileName === marker.fileName)!.content;
        const parseResult = getParseResults(text);
        const completionResult = await info.connection.sendRequest(
            CompletionRequest.type,
            {
                textDocument: { uri: fileUri.toString() },
                position: convertOffsetToPosition(marker.position, parseResult.tokenizerOutput.lines),
            },
            CancellationToken.None
        );

        assert(completionResult);
        assert(!isArray(completionResult));

        const completionItem = completionResult.items.find((i) => i.label === 'path')!;
        assert(completionItem);
    });

    test('background thread diagnostics', async () => {
        const code = `
// @filename: root/test.py
//// from math import cos, sin
//// import sys
//// [|/*marker*/|]
        `;
        const settings = [
            {
                item: {
                    scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                    section: 'basedpyright.analysis',
                },
                value: {
                    typeCheckingMode: 'strict',
                    diagnosticMode: 'workspace',
                },
            },
        ];

        const info = await runLanguageServer(
            DEFAULT_WORKSPACE_ROOT,
            code,
            /* callInitialize */ true,
            settings,
            undefined,
            /* supportsBackgroundThread */ true
        );

        // get the file containing the marker that also contains our task list comments
        await openFile(info, 'marker');

        // Wait for the diagnostics to publish
        const diagnostics = await waitForDiagnostics(info);
        const diagnostic = diagnostics.find((d) => d.uri.includes('root/test.py'));
        assert(diagnostic);
        assert.equal(diagnostic.diagnostics.length, 3);

        // Make sure the error has a special rule
        assert.equal(diagnostic.diagnostics[0].code, 'reportUnusedImport');
        assert.equal(diagnostic.diagnostics[1].code, 'reportUnusedImport');
        assert.equal(diagnostic.diagnostics[2].code, 'reportUnusedImport');
    });

    test('Diagnostic severity overrides test', async () => {
        const code = `
// @filename: test.py
//// def _test([|/*marker*/x|]): ...
//// 
// @filename: pyproject.toml
//// 
    `;
        const settings = [
            {
                item: {
                    scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                    section: 'basedpyright.analysis',
                },
                value: {
                    diagnosticSeverityOverrides: {
                        reportUnknownParameterType: 'warning',
                        reportUnusedFunction: 'unused',
                    },
                },
            },
        ];

        const info = await runLanguageServer(
            DEFAULT_WORKSPACE_ROOT,
            code,
            /* callInitialize */ true,
            settings,
            undefined,
            /* supportsBackgroundThread */ true
        );

        // get the file containing the marker that also contains our task list comments
        await openFile(info, 'marker');

        // Wait for the diagnostics to publish
        const diagnostics = await waitForDiagnostics(info);
        const file = diagnostics.find((d) => d.uri.includes('test.py'));
        assert(file);

        // Make sure the error has a special rule
        assert.equal(file.diagnostics[1].code, 'reportUnknownParameterType');

        // make sure additional diagnostic severities work
        assert.equal(
            file.diagnostics.find((diagnostic) => diagnostic.code === 'reportUnusedFunction')?.severity,
            DiagnosticSeverity.Hint // TODO: hint? how do we differentiate between unused/unreachable/deprecated?
        );
    });
    describe('module/package renaming', () => {
        describe('import statement', () => {
            test('rename module', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo.bar
//// foo.bar
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: {
                                        start: {
                                            line: 0,
                                            character: 11,
                                        },
                                        end: {
                                            line: 0,
                                            character: 14,
                                        },
                                    },
                                    newText: 'baz',
                                },
                                {
                                    range: {
                                        start: {
                                            line: 1,
                                            character: 4,
                                        },
                                        end: {
                                            line: 1,
                                            character: 7,
                                        },
                                    },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename module - alias', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo.bar as qux
//// qux
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: {
                                        start: {
                                            line: 0,
                                            character: 11,
                                        },
                                        end: {
                                            line: 0,
                                            character: 14,
                                        },
                                    },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename package', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo.bar
//// foo.bar
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: 'file:///src/foo', newUri: 'file:///src/foo2' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: {
                                        start: {
                                            line: 0,
                                            character: 7,
                                        },
                                        end: {
                                            line: 0,
                                            character: 10,
                                        },
                                    },
                                    newText: 'foo2',
                                },
                                {
                                    range: {
                                        start: {
                                            line: 1,
                                            character: 0,
                                        },
                                        end: {
                                            line: 1,
                                            character: 3,
                                        },
                                    },
                                    newText: 'foo2',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename top level package', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo.bar.baz
//// foo.bar.baz
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: 'file:///src/foo', newUri: 'file:///src/foo2' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: {
                                        start: {
                                            line: 0,
                                            character: 7,
                                        },
                                        end: {
                                            line: 0,
                                            character: 10,
                                        },
                                    },
                                    newText: 'foo2',
                                },
                                {
                                    range: {
                                        start: {
                                            line: 1,
                                            character: 0,
                                        },
                                        end: {
                                            line: 1,
                                            character: 3,
                                        },
                                    },
                                    newText: 'foo2',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });

            test('rename __init__ file to module (currently not supported so no edits should be created)', async () => {
                const code = `
// @filename: foo/__init__.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo
//// foo
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/bar.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [],
                });
            });
            test('move file (currently not supported so no edits should be created)', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// import foo
//// foo
//// 
`;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/bar.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
        });
        describe('import from statement', () => {
            test('rename imported name', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from foo import bar
//// bar
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } },
                                    newText: 'baz',
                                },
                                {
                                    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename imported name - alias', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from foo import bar as qux
//// qux
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename imported name from relative import', async () => {
                const code = `
// @filename: bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from . import bar
//// bar
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 14 }, end: { line: 0, character: 17 } },
                                    newText: 'baz',
                                },
                                {
                                    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename imported name from relative import - alias', async () => {
                const code = `
// @filename: bar.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from . import bar as qux
//// qux
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/baz.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 14 }, end: { line: 0, character: 17 } },
                                    newText: 'baz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename module', async () => {
                const code = `
// @filename: foo/bar.py
//// baz = 1 [|/*marker*/|]
//// 
// @filename: baz.py
//// from foo.bar import baz
//// baz
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: 'file:///src/foo/bar', newUri: 'file:///src/foo/bar2' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } },
                                    newText: 'bar2',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename package', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from foo.bar import baz
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: 'file:///src/foo/bar', newUri: 'file:///src/foo/bar2' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } },
                                    newText: 'bar2',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('rename top level package', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
//// 
// @filename: baz.py
//// from foo.bar import baz
//// 
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: 'file:///src/foo', newUri: 'file:///src/foo2' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } },
                                    newText: 'foo2',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/baz.py',
                                version: null,
                            },
                        },
                        {
                            edits: [],
                            textDocument: {
                                uri: marker.fileUri.toString(),
                                version: null,
                            },
                        },
                    ],
                });
            });
        });
    });

    test('error on invalid config - config file', async () => {
        const code = `
// @filename: test.py
//// 
// @filename: pyproject.toml
//// [tool.basedpyright]
//// typeCheckingMode = 'asdf'
//// 
    `;
        const settings = [
            {
                item: {
                    scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                    section: 'basedpyright.analysis',
                },
                value: {},
            },
        ];

        const info = await runLanguageServer(
            DEFAULT_WORKSPACE_ROOT,
            code,
            /* callInitialize */ true,
            settings,
            undefined,
            /* supportsBackgroundThread */ true
        );

        assert(info.notifications.length === 1);
        assert(
            info.notifications[0].message ===
                'invalid "typeCheckingMode" value: "asdf". expected: "off", "basic", "standard", "strict", "recommended", or "all"'
        );
    });

    test('error on invalid config - lsp settings', async () => {
        const code = `
// @filename: test.py
//// 
    `;
        const settings = [
            {
                item: {
                    scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                    section: 'basedpyright.analysis',
                },
                value: {
                    diagnosticMode: 'asdf',
                },
            },
        ];

        const info = await runLanguageServer(
            DEFAULT_WORKSPACE_ROOT,
            code,
            /* callInitialize */ true,
            settings,
            undefined,
            /* supportsBackgroundThread */ true
        );

        // get the file containing the marker that also contains our task list comments
        assert(info.notifications.length === 1);
        assert(
            info.notifications[0].message ===
                'invalid diagnosticMode: "asdf". valid options are "workspace" or "openFilesOnly"'
        );
    });
});
