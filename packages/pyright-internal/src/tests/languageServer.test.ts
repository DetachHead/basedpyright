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
    CompletionItem,
    CompletionRequest,
    ConfigurationItem,
    DidChangeWorkspaceFoldersNotification,
    DidCloseTextDocumentNotification,
    DocumentDiagnosticRequest,
    DiagnosticSeverity,
    DidChangeTextDocumentNotification,
    DocumentOnTypeFormattingRequest,
    InitializedNotification,
    InitializeRequest,
    MarkupContent,
    WillRenameFilesRequest,
} from 'vscode-languageserver';

import { convertOffsetToPosition } from '../common/positionUtils';
import { PythonVersion, pythonVersion3_10 } from '../common/pythonVersion';

import { isArray } from '../common/core';
import { normalizeSlashes } from '../common/pathUtils';
import { distlibFolder } from './harness/vfs/factory';
import {
    cleanupAfterAll,
    DEFAULT_WORKSPACE_ROOT,
    getParseResults,
    hover,
    openFile,
    PyrightServerInfo,
    runPyrightServer,
    sleep,
    waitForDiagnostics,
} from './lsp/languageServerTestUtils';
import { tExpect } from 'typed-jest-expect';

/** objects from `sendRequest` don't work with assertions and i cant figure out why */
const assertEqual = <T>(actual: T, expected: T) => expect(JSON.parse(JSON.stringify(actual))).toStrictEqual(expected);

const range = (startLine: number, startCharacter: number, endLine: number, endCharacter: number) => ({
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
});

const edits = (uri: string, edits: { range: ReturnType<typeof range>; newText: string }[]) => ({
    edits,
    textDocument: { uri, version: null },
});

describe(`Basic language server tests`, () => {
    let serverInfo: PyrightServerInfo | undefined;
    async function runLanguageServer(
        projectRoots: string[] | string,
        code: string,
        callInitialize = true,
        extraSettings?: { item: ConfigurationItem; value: any }[],
        pythonVersion: PythonVersion = pythonVersion3_10,
        supportsBackgroundThread?: boolean,
        supportsPullDiagnostics?: boolean
    ) {
        const result = await runPyrightServer(
            projectRoots,
            code,
            callInitialize,
            extraSettings,
            pythonVersion,
            supportsBackgroundThread,
            supportsPullDiagnostics
        );
        serverInfo = result;
        //TODO: why is this needed for the rename tests to work?
        await sleep(500);
        return result;
    }

    /** opens the file at the `marker` in `code`, then asks the server for the edits needed to move `oldUri` to `newUri` */
    async function renameFiles(code: string, oldUri: string, newUri: string) {
        const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
        openFile(serverInfo, 'marker');
        return await serverInfo.connection.sendRequest(
            WillRenameFilesRequest.type,
            { files: [{ oldUri, newUri }] },
            CancellationToken.None
        );
    }

    afterEach(async () => {
        if (serverInfo) {
            await serverInfo.dispose();
            serverInfo = undefined;
        }
        await cleanupAfterAll();
    });

    test.each([
        { name: 'capability disabled', capability: false, initFolders: 1, firstNotify: null, secondNotify: null },
        { name: '1 init, no notifications', capability: true, initFolders: 1, firstNotify: null, secondNotify: null },
        { name: '1 init, notify with 0', capability: true, initFolders: 1, firstNotify: 0, secondNotify: null },
        { name: '1 init, notify with 1', capability: true, initFolders: 1, firstNotify: 1, secondNotify: null },
        { name: '1 init, notify with 2', capability: true, initFolders: 1, firstNotify: 2, secondNotify: null },
        { name: '1 init, notify with 0 then 0', capability: true, initFolders: 1, firstNotify: 0, secondNotify: 0 },
        { name: '1 init, notify with 0 then 1', capability: true, initFolders: 1, firstNotify: 0, secondNotify: 1 },
        { name: '1 init, notify with 0 then 2', capability: true, initFolders: 1, firstNotify: 0, secondNotify: 2 },
        { name: '1 init, notify with 1 then 0', capability: true, initFolders: 1, firstNotify: 1, secondNotify: 0 },
        { name: '1 init, notify with 1 then 1', capability: true, initFolders: 1, firstNotify: 1, secondNotify: 1 },
        { name: '1 init, notify with 1 then 2', capability: true, initFolders: 1, firstNotify: 1, secondNotify: 2 },
        { name: '1 init, notify with 2 then 0', capability: true, initFolders: 1, firstNotify: 2, secondNotify: 0 },
        { name: '1 init, notify with 2 then 1', capability: true, initFolders: 1, firstNotify: 2, secondNotify: 1 },
        { name: '1 init, notify with 2 then 2', capability: true, initFolders: 1, firstNotify: 2, secondNotify: 2 },
        { name: '2 init, no notifications', capability: true, initFolders: 2, firstNotify: null, secondNotify: null },
        { name: '2 init, notify with 2', capability: true, initFolders: 2, firstNotify: 2, secondNotify: null },
        { name: '0 init, notify with 1', capability: true, initFolders: 0, firstNotify: 1, secondNotify: null },
        { name: '0 init, notify with 2', capability: true, initFolders: 0, firstNotify: 2, secondNotify: null },
    ])('workspace initialization: $name', async ({ capability, initFolders, firstNotify, secondNotify }) => {
        const code = `
// @filename: test.py
//// import [|/*marker*/os|]
        `;
        const info = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, false);
        const params = info.getInitializeParams();
        const folders = params.workspaceFolders!;
        const folder2 = { name: 'workspace2', uri: 'file:///workspace2' };

        params.capabilities.workspace!.workspaceFolders = capability;
        if (initFolders === 0) {
            params.workspaceFolders = [];
        } else if (initFolders === 2) {
            params.workspaceFolders = [...folders, folder2];
        }

        await info.connection.sendRequest(InitializeRequest.type, params, CancellationToken.None);
        await info.connection.sendNotification(InitializedNotification.type, {});

        const getFoldersForNotify = (count: number) => {
            if (count === 0) return [];
            if (count === 1) return folders;
            return [...folders, folder2];
        };

        if (firstNotify !== null) {
            await info.connection.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
                event: { added: getFoldersForNotify(firstNotify), removed: [] },
            });
        }
        if (secondNotify !== null) {
            await info.connection.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
                event: { added: getFoldersForNotify(secondNotify), removed: [] },
            });
        }

        openFile(info, 'marker');
        const result = await hover(info, 'marker');
        assert(result && MarkupContent.is(result.contents));
        assert.strictEqual(result.contents.value, '```python\n(module) os\n```');
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

        const completionItem = completionResult.items.find((i: CompletionItem) => i.label === 'path')!;
        assert(completionItem);
    });
    describe('onTypeFormatting', () => {
        const caret = '[|/*marker*/|]';
        const checkOnTypeFormatting = async (options: {
            stringPrefix?: string;
            stringContent?: string;
            quoteCount: 1 | 3;
            shouldConvertString: boolean;
        }) => {
            const quotes = options.quoteCount === 3 ? '"""' : '"';
            const code = `
// @filename: test.py
//// foo = ${options.stringPrefix ?? ''}${quotes}${options.stringContent ?? caret}${quotes}
        `;
            const info = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, /* callInitialize */ true);

            openFile(info, 'marker');
            const marker = info.testData.markerPositions.get('marker')!;
            const fileUri = marker.fileUri;
            const text = info.testData.files.find((d) => d.fileName === marker.fileName)!.content;
            const parseResult = getParseResults(text);
            const position = convertOffsetToPosition(marker.position, parseResult.tokenizerOutput.lines);
            // need to send this notification first before onTypeFormatting.
            // see https://github.com/microsoft/language-server-protocol/issues/1053#issuecomment-725468469
            await info.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                textDocument: { uri: fileUri.toString(), version: 2 },
                contentChanges: [{ range: { start: position, end: position }, text: '{}' }],
            });
            const onTypeFormattingRequest = await info.connection.sendRequest(
                DocumentOnTypeFormattingRequest.type,
                {
                    textDocument: { uri: fileUri.toString() },
                    // need to add 1 to the position because it's inserting a character (i think)
                    position: { line: position.line, character: position.character + 1 },
                    ch: '{',
                    options: { insertSpaces: true, tabSize: 4 },
                },
                CancellationToken.None
            );
            if (options.shouldConvertString) {
                const expectedPosition = { character: 6, line: 0 };
                tExpect(onTypeFormattingRequest).toEqual([
                    { newText: 'f', range: { start: expectedPosition, end: expectedPosition } },
                ]);
            } else {
                tExpect(onTypeFormattingRequest).toBeNull();
            }
        };
        test('normal string', () => checkOnTypeFormatting({ quoteCount: 1, shouldConvertString: true }));
        test('already f-string', () =>
            checkOnTypeFormatting({ stringPrefix: 'f', quoteCount: 1, shouldConvertString: false }));
        test('r-string', () => checkOnTypeFormatting({ stringPrefix: 'r', quoteCount: 1, shouldConvertString: false }));
        test('R-string', () => checkOnTypeFormatting({ stringPrefix: 'R', quoteCount: 1, shouldConvertString: false }));
        test('bytes', () => checkOnTypeFormatting({ stringPrefix: 'b', quoteCount: 1, shouldConvertString: false }));
        test('t-string', () => checkOnTypeFormatting({ stringPrefix: 't', quoteCount: 1, shouldConvertString: false }));
        test('u-string', () => checkOnTypeFormatting({ stringPrefix: 'u', quoteCount: 1, shouldConvertString: false }));
        test('r-string and b-string', () =>
            checkOnTypeFormatting({ stringPrefix: 'rb', quoteCount: 1, shouldConvertString: false }));
        test('multiline string', () => checkOnTypeFormatting({ quoteCount: 3, shouldConvertString: true }));
        describe('named unicode characters (\\N)', () => {
            test('normal', () =>
                checkOnTypeFormatting({ quoteCount: 1, stringContent: `\\N${caret}`, shouldConvertString: false }));
            test('multiline string', () =>
                checkOnTypeFormatting({ quoteCount: 3, stringContent: `\\N${caret}`, shouldConvertString: false }));
            test('other characters in the string', () =>
                checkOnTypeFormatting({ quoteCount: 1, stringContent: `asdf\\N${caret}`, shouldConvertString: false }));
            test('off by 1', () =>
                checkOnTypeFormatting({ quoteCount: 1, stringContent: `\\N ${caret}`, shouldConvertString: true }));
        });
    });

    [false, true].forEach((supportsPullDiagnostics) => {
        describe(`Diagnostics ${supportsPullDiagnostics ? 'pull' : 'push'}`, () => {
            // Background analysis takes longer than 5 seconds sometimes, so we need to
            // increase the timeout.
            jest.setTimeout(200000);
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
                    /* supportsBackgroundThread */ true,
                    supportsPullDiagnostics
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

            test('background thread diagnostics open mode', async () => {
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
                            section: 'python.analysis',
                        },
                        value: {
                            typeCheckingMode: 'strict',
                        },
                    },
                ];

                const info = await runLanguageServer(
                    DEFAULT_WORKSPACE_ROOT,
                    code,
                    /* callInitialize */ true,
                    settings,
                    undefined,
                    /* supportsBackgroundThread */ true,
                    supportsPullDiagnostics
                );

                // get the file containing the marker that also contains our task list comments
                await openFile(info, 'marker');

                // Wait for the diagnostics to publish
                const diagnostics = await waitForDiagnostics(info);
                const diagnostic = diagnostics.find((d) => d.uri.includes('root/test.py'));
                assert(diagnostic);
                const unusedImports = diagnostic.diagnostics.filter((d) => d.code === 'reportUnusedImport');
                assert.equal(unusedImports.length, 3);
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
                    /* supportsBackgroundThread */ true,
                    supportsPullDiagnostics
                );

                // get the file containing the marker that also contains our task list comments
                await openFile(info, 'marker');

                // Wait for the diagnostics to publish
                const diagnostics = await waitForDiagnostics(info);
                const file = diagnostics.find((d) => d.uri.includes('test.py'));
                assert(file);

                // Make sure the error has a special rule
                assert.ok(
                    file.diagnostics.some((d) => d.code === 'reportUnknownParameterType'),
                    `Expected diagnostic not found. Got ${JSON.stringify(file.diagnostics)}`
                );

                // make sure additional diagnostic severities work
                assert.equal(
                    file.diagnostics.find((diagnostic) => diagnostic.code === 'reportUnusedFunction')?.severity,
                    DiagnosticSeverity.Hint // TODO: hint? how do we differentiate between unused/unreachable/deprecated?
                );
            });

            test('disableLanguageServices', async () => {
                const code = `
// @filename: test.py
//// def _test([|/*marker*/|]): ...
////
// @filename: pyproject.toml
////
    `;
                const settings = [
                    {
                        item: {
                            scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                            section: 'basedpyright',
                        },
                        value: {
                            disableLanguageServices: true,
                        },
                    },
                ];

                const info = await runLanguageServer(
                    DEFAULT_WORKSPACE_ROOT,
                    code,
                    /* callInitialize */ true,
                    settings,
                    undefined,
                    /* supportsBackgroundThread */ true,
                    supportsPullDiagnostics
                );

                // get the file containing the marker that also contains our task list comments
                await openFile(info, 'marker');

                // Wait for the diagnostics to publish
                const diagnostics = await waitForDiagnostics(info);
                const file = diagnostics.find((d) => d.uri.includes('test.py'));
                assert(file);

                // Make sure diagnostics are still reported
                tExpect(file.diagnostics.length).toStrictEqual(1);
            });

            if (supportsPullDiagnostics) {
                // Regression test: in open-files-only mode, diagnostics for a library/out-of-workspace
                // file that was transiently opened (e.g. via go-to-definition) must clear once the client
                // closes the file. A re-pull of the now-closed file must return an empty `full` report.
                test('closed out-of-workspace file clears diagnostics on pull (open-files-only)', async () => {
                    const libraryPath = normalizeSlashes(`${distlibFolder.getFilePath()}/library.py`);
                    const code = `
// @filename: ${libraryPath}
//// x: int = [|/*lib*/"not an int"|]
        `;
                    const settings = [
                        {
                            item: {
                                scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                                section: 'python.analysis',
                            },
                            value: {
                                // default open-files-only mode
                                diagnosticMode: 'openFilesOnly',
                            },
                        },
                    ];

                    const info = await runLanguageServer(
                        DEFAULT_WORKSPACE_ROOT,
                        code,
                        /* callInitialize */ true,
                        settings,
                        undefined,
                        /* supportsBackgroundThread */ true,
                        supportsPullDiagnostics
                    );

                    // Simulate go-to-definition opening the out-of-workspace library file.
                    await openFile(info, 'lib');
                    const libUri = info.testData.markerPositions.get('lib')!.fileUri.toString();

                    // 1) While the library file is open, a pull reports the type error.
                    const reportOpen: any = await info.connection.sendRequest(DocumentDiagnosticRequest.type, {
                        textDocument: { uri: libUri },
                    });
                    assert.strictEqual(reportOpen?.kind, 'full');
                    assert.ok(
                        (reportOpen?.items?.length ?? 0) > 0,
                        `expected library file to report errors while open, got ${JSON.stringify(reportOpen?.items)}`
                    );

                    // 2) Close the library file.
                    info.connection.sendNotification(DidCloseTextDocumentNotification.type, {
                        textDocument: { uri: libUri },
                    });

                    // 3) A re-pull of the now-closed out-of-workspace file must return an empty full report.
                    const reportClosed: any = await info.connection.sendRequest(DocumentDiagnosticRequest.type, {
                        textDocument: { uri: libUri },
                    });
                    assert.strictEqual(reportClosed?.kind, 'full');
                    assert.strictEqual(
                        reportClosed?.items?.length ?? 0,
                        0,
                        `expected no diagnostics for closed out-of-workspace library file, got ${JSON.stringify(
                            reportClosed?.items
                        )}`
                    );
                });

                // Regression guard: the open-state guard must only apply in
                // open-files-only mode. In `workspace` mode (`checkOnlyOpenFiles === false`) a file
                // that the client has closed is still analyzed, so a re-pull must continue to report
                // its diagnostics. This proves the guard's `checkOnlyOpenFiles` condition is
                // load-bearing and that the fix did not change workspace-mode behavior.
                test('closed workspace file still reports diagnostics on pull (workspace mode)', async () => {
                    const code = `
// @filename: root/test.py
//// x: int = [|/*marker*/"not an int"|]
        `;
                    const settings = [
                        {
                            item: {
                                scopeUri: `file://${normalizeSlashes(DEFAULT_WORKSPACE_ROOT, '/')}`,
                                section: 'python.analysis',
                            },
                            value: {
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
                        /* supportsBackgroundThread */ true,
                        supportsPullDiagnostics
                    );

                    await openFile(info, 'marker');
                    const fileUri = info.testData.markerPositions.get('marker')!.fileUri.toString();

                    // 1) While the file is open, a pull reports the type error.
                    const reportOpen: any = await info.connection.sendRequest(DocumentDiagnosticRequest.type, {
                        textDocument: { uri: fileUri },
                    });
                    assert.strictEqual(reportOpen?.kind, 'full');
                    assert.ok(
                        (reportOpen?.items?.length ?? 0) > 0,
                        `expected workspace file to report errors while open, got ${JSON.stringify(reportOpen?.items)}`
                    );

                    // 2) Close the file.
                    info.connection.sendNotification(DidCloseTextDocumentNotification.type, {
                        textDocument: { uri: fileUri },
                    });

                    // 3) In workspace mode the closed file is still analyzed, so a re-pull must still
                    //    report the error (the open-state guard must NOT fire here).
                    const reportClosed: any = await info.connection.sendRequest(DocumentDiagnosticRequest.type, {
                        textDocument: { uri: fileUri },
                    });
                    assert.strictEqual(reportClosed?.kind, 'full');
                    assert.ok(
                        (reportClosed?.items?.length ?? 0) > 0,
                        `expected workspace-mode closed file to still report errors, got ${JSON.stringify(
                            reportClosed?.items
                        )}`
                    );
                });
            }
        });
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
            test('move module to another directory', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// import foo.bar
//// foo.bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 7, 0, 14), newText: 'bar' },
                            { range: range(1, 0, 1, 7), newText: 'bar' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                    ],
                });
            });
            test('move module into a package', async () => {
                const code = `
// @filename: bar.py
//// # empty file [|/*marker*/|]
////
// @filename: foo/__init__.py
////
// @filename: baz.py
//// import bar
//// bar
////
`;
                const result = await renameFiles(code, 'file:///src/bar.py', 'file:///src/foo/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/bar.py', []),
                        edits('file:///src/baz.py', [
                            { range: range(0, 7, 0, 10), newText: 'foo.bar' },
                            { range: range(1, 0, 1, 3), newText: 'foo.bar' },
                        ]),
                        edits('file:///src/foo/__init__.py', []),
                    ],
                });
            });
            test('move and rename module', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// import foo.bar
//// foo.bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/qux/baz.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 7, 0, 14), newText: 'qux.baz' },
                            { range: range(1, 0, 1, 7), newText: 'qux.baz' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move module into a package with the same name', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// import foo.bar
//// foo.bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/foo/bar/baz.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 11, 0, 14), newText: 'bar.baz' },
                            { range: range(1, 4, 1, 7), newText: 'bar.baz' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                    ],
                });
            });
            test('move module out of a package to take its name', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// import foo.bar.baz
//// foo.bar.baz
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar/baz.py', 'file:///src/foo/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 11, 0, 18), newText: 'bar' },
                            { range: range(1, 4, 1, 11), newText: 'bar' },
                        ]),
                        edits('file:///src/foo/bar/baz.py', []),
                    ],
                });
            });
            test('move module - alias', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// import foo.bar as qux
//// qux
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [{ range: range(0, 7, 0, 14), newText: 'bar' }]),
                        edits('file:///src/foo/bar.py', []),
                    ],
                });
            });
            test('move package', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// import foo.bar.baz
//// foo.bar.baz
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar', 'file:///src/qux/bar');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 7, 0, 14), newText: 'qux.bar' },
                            { range: range(1, 0, 1, 7), newText: 'qux.bar' },
                        ]),
                        edits('file:///src/foo/bar/baz.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move package - relative imports inside it are unchanged', async () => {
                const code = `
// @filename: foo/bar.py
//// baz = 1 [|/*marker*/|]
////
// @filename: foo/qux.py
//// from .bar import baz
//// baz
////
// @filename: pkg/__init__.py
////
// @filename: baz.py
//// import foo.bar
//// foo.bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo', 'file:///src/pkg/foo');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 7, 0, 10), newText: 'pkg.foo' },
                            { range: range(1, 0, 1, 3), newText: 'pkg.foo' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/qux.py', []),
                        edits('file:///src/pkg/__init__.py', []),
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
                                    range: {
                                        start: { line: 0, character: 16 },
                                        end: { line: 0, character: 19 },
                                    },
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
                                    range: {
                                        start: { line: 0, character: 16 },
                                        end: { line: 0, character: 19 },
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
                                    range: {
                                        start: { line: 0, character: 14 },
                                        end: { line: 0, character: 17 },
                                    },
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
                                    range: {
                                        start: { line: 0, character: 14 },
                                        end: { line: 0, character: 17 },
                                    },
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
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/bar2.py' }],
                    },
                    CancellationToken.None
                );
                assertEqual(result, {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    range: {
                                        start: { line: 0, character: 9 },
                                        end: { line: 0, character: 12 },
                                    },
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
                                    range: {
                                        start: { line: 0, character: 9 },
                                        end: { line: 0, character: 12 },
                                    },
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
            test('relative import', async () => {
                const code = `
// @filename: foo/bar.py
//// baz = 1[|/*marker*/|]
////
// @filename: foo/qux.py
//// from .bar import baz
//// baz
////
    `;
                const serverInfo = await runLanguageServer(DEFAULT_WORKSPACE_ROOT, code, true);
                openFile(serverInfo, 'marker');
                const marker = serverInfo.testData.markerPositions.get('marker')!;
                const result = await serverInfo.connection.sendRequest(
                    WillRenameFilesRequest.type,
                    {
                        files: [{ oldUri: marker.fileUri.toString(), newUri: 'file:///src/foo/bazz.py' }],
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
                                    range: {
                                        start: { line: 0, character: 6 },
                                        end: { line: 0, character: 9 },
                                    },
                                    newText: 'bazz',
                                },
                            ],
                            textDocument: {
                                uri: 'file:///src/foo/qux.py',
                                version: null,
                            },
                        },
                    ],
                });
            });
            test('move module to another package', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// from foo import bar
//// bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/qux/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [{ range: range(0, 5, 0, 8), newText: 'qux' }]),
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move module to top level', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// from foo import bar
//// bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [{ range: range(0, 0, 0, 19), newText: 'import bar' }]),
                        edits('file:///src/foo/bar.py', []),
                    ],
                });
            });
            test('move module to top level - alias', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: baz.py
//// from foo import bar as qux
//// qux
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [{ range: range(0, 0, 0, 26), newText: 'import bar as qux' }]),
                        edits('file:///src/foo/bar.py', []),
                    ],
                });
            });
            test('move module out of a statement that imports other names too', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: foo/other.py
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// from foo import bar, other
//// bar
//// other
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/qux/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(0, 16, 0, 21), newText: '' },
                            { range: range(0, 26, 0, 26), newText: '\nfrom qux import bar' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/other.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move module out of a statement that imports other names too - last name, indented', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: foo/other.py
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// def f():
////     from foo import other, bar as b
////     return other, b
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/qux/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [
                            { range: range(1, 25, 1, 35), newText: '' },
                            { range: range(1, 35, 1, 35), newText: '\n    from qux import bar as b' },
                        ]),
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/other.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move module out of the package - relative import', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: foo/baz.py
//// from . import bar
//// bar
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/baz.py', [{ range: range(0, 0, 0, 17), newText: 'import bar' }]),
                    ],
                });
            });
            test('move module to a sibling package - relative import', async () => {
                const code = `
// @filename: foo/bar.py
//// # empty file [|/*marker*/|]
////
// @filename: foo/baz.py
//// from . import bar
//// bar
////
// @filename: qux/__init__.py
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/qux/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/baz.py', [{ range: range(0, 5, 0, 6), newText: 'qux' }]),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
            test('move module into a subpackage - relative import', async () => {
                const code = `
// @filename: foo/bar.py
//// baz = 1 [|/*marker*/|]
////
// @filename: foo/sub/__init__.py
////
// @filename: foo/baz.py
//// from . import bar
//// from .bar import baz
//// bar, baz
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar.py', 'file:///src/foo/sub/bar.py');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/foo/bar.py', []),
                        edits('file:///src/foo/baz.py', [
                            { range: range(0, 5, 0, 6), newText: '.sub' },
                            { range: range(1, 6, 1, 9), newText: 'sub.bar' },
                        ]),
                        edits('file:///src/foo/sub/__init__.py', []),
                    ],
                });
            });
            test('move package', async () => {
                const code = `
// @filename: foo/bar/baz.py
//// # empty file [|/*marker*/|]
////
// @filename: qux/__init__.py
////
// @filename: baz.py
//// from foo.bar import baz
////
`;
                const result = await renameFiles(code, 'file:///src/foo/bar', 'file:///src/qux/bar');
                assertEqual(result, {
                    documentChanges: [
                        edits('file:///src/baz.py', [{ range: range(0, 5, 0, 12), newText: 'qux.bar' }]),
                        edits('file:///src/foo/bar/baz.py', []),
                        edits('file:///src/qux/__init__.py', []),
                    ],
                });
            });
        });
    });
    describe('error on invalid config', () => {
        test('config file', async () => {
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

        test('lsp settings', async () => {
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
});
