/*
 * autoImporter.test.ts
 * Tests for auto-import completion logic.
 */

import { CancellationToken } from 'vscode-languageserver';
import { tExpect } from 'typed-jest-expect';

import { convertOffsetToPosition } from '../common/positionUtils';
import { CompletionOptions, CompletionProvider } from '../languageService/completionProvider';
import { parseAndGetTestState } from './harness/fourslash/testState';

test('CompletionProvider surfaces auto-imports from unopened tracked workspace files', () => {
    const code = `
// @filename: test.py
//// some_func/*marker*/

// @filename: mod_unopened.py
//// def some_function(arg: str):
////     ...
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    const markerFile = state.testData.files.find((f) => f.fileName === marker.fileName)!;
    const unopenedFile = state.testData.files.find((f) => f.fileName !== marker.fileName)!;

    // Sanity check: only the marker file has been opened, so the tracked-but-unopened
    // file has no module symbol table yet. This is the scenario that previously hid
    // workspace symbols from auto-import completions (issue #545).
    tExpect(state.program.getModuleSymbolTable(unopenedFile.fileUri)).toBeUndefined();

    const parseResult = state.program.getParseResults(markerFile.fileUri)!;
    const position = convertOffsetToPosition(marker.position, parseResult.tokenizerOutput.lines);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        markerFile.fileUri,
        position,
        options,
        CancellationToken.None,
        /* codeActions */ false
    ).getCompletions();

    tExpect(result).not.toBeNull();
    const item = result!.items.find((i) => i.label === 'some_function' && i.detail === 'Auto-import');
    tExpect(item).toBeDefined();
    tExpect(item!.additionalTextEdits?.some((e) => e.newText.includes('from mod_unopened import some_function'))).toBe(
        true
    );
});
