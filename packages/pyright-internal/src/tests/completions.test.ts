/*
 * completions.test.ts
 *
 * completions tests.
 */

import assert from 'assert';
import { CancellationToken } from 'vscode-languageserver';
import { ApplyKind, CompletionItemKind, CompletionItemTag, MarkupKind } from 'vscode-languageserver-types';

import { Uri } from '../common/uri/uri';
import { CompletionItemData, CompletionOptions, CompletionProvider } from '../languageService/completionProvider';
import { parseAndGetTestState } from './harness/fourslash/testState';

const configEnableExplicitOverride = `
// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }
`;

test('completion import statement tooltip', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import [|/*marker*/m|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: 'matplotlib',
                },
            ],
        },
    });
});

test('completion import statement tooltip - stub file', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import [|/*marker*/m|]

// @filename: matplotlib/__init__.pyi
// @library: true
//// # empty

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: 'matplotlib',
                },
            ],
        },
    });
});

test('completion import statement tooltip - doc in stub file', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import [|/*marker*/m|]

// @filename: matplotlib/__init__.pyi
// @library: true
//// """ matplotlib """

// @filename: matplotlib/__init__.py
// @library: true
//// # empty
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: 'matplotlib',
                },
            ],
        },
    });
});

test('completion import statement tooltip - sub modules', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib.[|/*marker*/p|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'pyplot',
                    documentation: 'pyplot',
                },
            ],
        },
    });
});

test('completion import reference tooltip', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib
//// [|/*marker*/m|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: '```python\nmatplotlib\n```\n---\nmatplotlib',
                },
            ],
        },
    });
});

test('completion import reference tooltip - first module', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib.pyplot
//// [|/*marker*/m|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: '```python\nmatplotlib\n```\n---\nmatplotlib',
                },
            ],
        },
    });
});

test('completion import reference tooltip - child module', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib.pyplot
//// matplotlib.[|/*marker*/p|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'pyplot',
                    documentation: '```python\npyplot\n```\n---\npyplot',
                },
            ],
        },
    });
});

test('completion from import statement tooltip - first module', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from [|/*marker*/m|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'matplotlib',
                    documentation: 'matplotlib',
                },
            ],
        },
    });
});

test('completion from import statement tooltip - child module', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from matplotlib.[|/*marker*/p|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'pyplot',
                    documentation: 'pyplot',
                },
            ],
        },
    });
});

test('completion from import statement tooltip - implicit module', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from matplotlib import [|/*marker*/p|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Module,
                    label: 'pyplot',
                    documentation: 'pyplot',
                },
            ],
        },
    });
});

test('include literals in expression completion', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict
//// 
//// class TestType(TypedDict):
////     key_a: str
////     key_b: int
//// 
//// var: TestType = {}
//// 
//// var[[|key_a/*marker*/|]]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: "'key_a'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'key_a'" },
                },
            ],
        },
    });
});

test('include literals in set key', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict
//// 
//// class TestType(TypedDict):
////     key_a: str
////     key_b: int
//// 
//// var: TestType = { [|key_a/*marker*/|] }
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: "'key_a'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'key_a'" },
                },
            ],
        },
    });
});

test('include literals in dict key', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict
//// 
//// class TestType(TypedDict):
////     key_a: str
////     key_b: int
//// 
//// var: TestType = { [|key_a/*marker*/|] : "hello" }
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"key_a"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"key_a"' },
                },
            ],
        },
    });
});

test('literals support for binary operators - equals', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     if c == [|"/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('literals support for binary operators - not equals', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     if c != [|"/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('literals support for binary operators without string node', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     if c != [|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                },
            ],
        },
    });
});

test('literals support for binary operators with prior word', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     if c != [|US/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                },
            ],
        },
    });
});

test('literals support for binary operators - assignment expression', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     if c := [|"/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('literals support for call', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency) -> Currency:
////     return c
////
//// if foo([|"/*marker1*/"|]) == [|"/*marker2*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker1: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker1'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker1'), newText: '"EUR"' },
                },
            ],
        },
        marker2: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker2'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker2'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('list with literal types', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// a: list[Currency] = [[|"/*marker*/"|]]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('literals support for match - error case', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     match c:
////         case [|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                },
            ],
        },
    });
});

test('literals support for match - simple case', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     match c:
////         case [|"/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"USD"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"EUR"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"EUR"' },
                },
            ],
        },
    });
});

test('literals support for match - simple case without string', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     match c:
////         case [|US/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"USD"',
                },
            ],
        },
    });
});

test('completion quote trigger', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["USD", "EUR"]
//// 
//// def foo(c: Currency):
////     match c:
////         case [|"/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        triggerCharacter: '"',
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        uri,
        position,
        options,
        CancellationToken.None,
        false
    ).getCompletions();

    assert(result);
    const item = result.items.find((a) => a.label === '"USD"');
    assert(item);
});

test('completion quote trigger - middle', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal
//// 
//// Currency = Literal["Quote'Middle"]
//// 
//// def foo(c: Currency):
////     match c:
////         case [|"Quote'/*marker*/"|]
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        triggerCharacter: "'",
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        uri,
        position,
        options,
        CancellationToken.None,
        false
    ).getCompletions();

    assert.strictEqual(result?.items.length, 0);
});

test('auto import sort text', async () => {
    const code = `
// @filename: test.py
//// [|os/*marker*/|]

// @filename: unused.py
//// import os
//// p = os.path

// @filename: vendored/__init__.py
// @library: true
//// # empty

// @filename: vendored/os.py
// @library: true
//// def foo(): pass
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFiles(state.testData.files.map((f) => f.fileName));

    while (state.workspace.service.test_program.analyze());

    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        uri,
        position,
        options,
        CancellationToken.None,
        false
    ).getCompletions();

    const items = result?.items.filter((i) => i.label === 'os');
    assert.strictEqual(items?.length, 2);

    items.sort((a, b) => a.sortText!.localeCompare(b.sortText!));

    assert(!items[0].labelDetails);
    assert.strictEqual(items[1].labelDetails!.description, 'vendored');
});

test('completion MRU affects sort order', async () => {
    type RecentCompletionInfo = {
        label: string;
        autoImportText: string;
    };

    const completionProviderTestAccess = CompletionProvider as unknown as {
        [key: string]: RecentCompletionInfo[];
    };

    // Reset MRU list to keep the test deterministic.
    completionProviderTestAccess._mostRecentCompletions = [];

    const code = `
// @filename: test.py
//// true_divide = 0
//// truly = 0
//// tru/*marker*/
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFiles(state.testData.files.map((f) => f.fileName));

    while (state.workspace.service.test_program.analyze());

    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const provider1 = new CompletionProvider(state.program, uri, position, options, CancellationToken.None, false);
    const result1 = provider1.getCompletions();
    assert(result1);

    const truly1 = result1.items.find((i) => i.label === 'truly');
    const trueDivide1 = result1.items.find((i) => i.label === 'true_divide');
    assert(truly1?.sortText);
    assert(trueDivide1?.sortText);

    // Not in MRU list yet: both share the same category, so neither is promoted.
    assert.strictEqual(truly1.sortText.split('.')[0], trueDivide1.sortText.split('.')[0]);

    // Accepting 'truly' records it in the MRU. (MRU is updated on accept, not on passive resolve.)
    CompletionProvider.recordCompletionAccepted('truly', '');

    const provider2 = new CompletionProvider(state.program, uri, position, options, CancellationToken.None, false);
    const result2 = provider2.getCompletions();
    assert(result2);

    const truly2 = result2.items.find((i) => i.label === 'truly');
    const trueDivide2 = result2.items.find((i) => i.label === 'true_divide');
    assert(truly2?.sortText);
    assert(trueDivide2?.sortText);

    // Now the selected item is in MRU and is promoted to an earlier category. Compare relative
    // ordering instead of hard-coding enum-derived SortCategory prefixes (which shift whenever a new
    // SortCategory is inserted).
    assert(truly2.sortText < truly1.sortText); // promoted ahead of its own pre-MRU position
    assert(truly2.sortText < trueDivide2.sortText); // and ahead of the non-MRU sibling
    assert.strictEqual(trueDivide2.sortText.split('.')[0], trueDivide1.sortText.split('.')[0]); // sibling unchanged

    // Reset MRU list so it doesn't affect other tests.
    completionProviderTestAccess._mostRecentCompletions = [];
});

test('passive resolve does not change MRU sort order', async () => {
    type RecentCompletionInfo = {
        label: string;
        autoImportText: string;
    };

    const completionProviderTestAccess = CompletionProvider as unknown as {
        [key: string]: RecentCompletionInfo[];
    };

    // Reset MRU list to keep the test deterministic.
    completionProviderTestAccess._mostRecentCompletions = [];

    const code = `
// @filename: test.py
//// true_divide = 0
//// truly = 0
//// tru/*marker*/
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFiles(state.testData.files.map((f) => f.fileName));

    while (state.workspace.service.test_program.analyze());

    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const provider1 = new CompletionProvider(state.program, uri, position, options, CancellationToken.None, false);
    const result1 = provider1.getCompletions();
    assert(result1);

    const truly1 = result1.items.find((i) => i.label === 'truly');
    const trueDivide1 = result1.items.find((i) => i.label === 'true_divide');
    assert(truly1?.sortText);
    assert(trueDivide1?.sortText);
    assert.strictEqual(truly1.sortText.split('.')[0], trueDivide1.sortText.split('.')[0]);

    // Passive resolve (fired per keystroke while previewing inline suggestions) must NOT mutate the
    // MRU; otherwise the ranking oscillates as the user types.
    await provider1.resolveCompletionItem(truly1);

    const provider2 = new CompletionProvider(state.program, uri, position, options, CancellationToken.None, false);
    const result2 = provider2.getCompletions();
    assert(result2);

    const truly2 = result2.items.find((i) => i.label === 'truly');
    const trueDivide2 = result2.items.find((i) => i.label === 'true_divide');
    assert(truly2?.sortText);
    assert(trueDivide2?.sortText);

    // Sort order is unchanged because resolve did not record anything in the MRU.
    assert.strictEqual(truly2.sortText.split('.')[0], trueDivide2.sortText.split('.')[0]);
    assert.strictEqual(completionProviderTestAccess._mostRecentCompletions.length, 0);

    // Reset MRU list so it doesn't affect other tests.
    completionProviderTestAccess._mostRecentCompletions = [];
});

test('override generic', async () => {
    const code = `
// @filename: test.py
//// from typing import Generic, TypeVar
//// from typing_extensions import override
//// 
//// T = TypeVar('T')
//// class A(Generic[T]):
////     def foo(self, x: list[T]) -> T:
////         return x
////     
//// class B(A[int]):
////     @override
////     def [|foo/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker'),
                        newText: 'foo(self, x: list[T]) -> T:\n    return super().foo(x)',
                    },
                },
            ],
        },
    });
});

test('override generic nested', async () => {
    const code = `
// @filename: test.py
//// from typing import Generic, TypeVar
//// from typing_extensions import override
//// 
//// T = TypeVar('T')
//// T2 = TypeVar('T2')
//// class A(Generic[T, T2]):
////     def foo(self, x: tuple[T, T2]) -> T:
////         return x
////     
//// 
//// T3 = TypeVar('T3')
//// class B(A[int, T3]):
////     @override
////     def [|foo/*marker1*/|]
////     
//// class C(B[int]):
////     @override
////     def [|foo/*marker2*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker1']: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker1'),
                        newText: 'foo(self, x: tuple[T, T2]) -> T:\n    return super().foo(x)',
                    },
                },
            ],
        },
        ['marker2']: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker2'),
                        newText: 'foo(self, x: tuple[T, T2]) -> T:\n    return super().foo(x)',
                    },
                },
            ],
        },
    });
});

test('override __call__', async () => {
    const code = `
${configEnableExplicitOverride}
// @filename: test.py
//// from argparse import Action[|/*importMarker*/|]
//// 
//// class MyAction(Action):
////     [|/*overrideMarker*/|]def [|__call__/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: '__call__',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker'),
                        newText:
                            '__call__(self, parser: ArgumentParser, namespace: Namespace, values: str | Sequence[Any] | None, option_string: str | None = None) -> None:\n    return super().__call__(parser, namespace, values, option_string)',
                    },
                    additionalTextEdits: [
                        {
                            range: state.getPositionRange('importMarker'),
                            newText: '\nfrom typing import override',
                        },
                        {
                            range: state.getPositionRange('overrideMarker'),
                            newText: '@override\n    ',
                        },
                    ],
                },
            ],
        },
    });
});

test('override ParamSpec', async () => {
    const code = `
${configEnableExplicitOverride}
// @filename: test.py
//// from typing import Callable, ParamSpec[|/*importMarker*/|]
////
//// P = ParamSpec("P")
////
//// class A:
////     def foo(self, func: Callable[P, None], *args: P.args, **kwargs: P.kwargs):
////         pass
//// 
//// class B(A):
////     [|/*overrideMarker*/|]def [|foo/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker'),
                        newText:
                            'foo(self, func: Callable[P, None], *args: P.args, **kwargs: P.kwargs):\n    return super().foo(func, *args, **kwargs)',
                    },
                    additionalTextEdits: [
                        {
                            range: state.getPositionRange('importMarker'),
                            newText: ', override',
                        },
                        {
                            range: state.getPositionRange('overrideMarker'),
                            newText: '@override\n    ',
                        },
                    ],
                },
            ],
        },
    });
});

test('annotation using comment', async () => {
    const code = `
${configEnableExplicitOverride}
// @filename: test.py
//// [|/*importMarker*/|]class A:
////     def foo(self, a): # type: (int) -> None
////         pass
//// 
//// class B(A):
////     [|/*overrideMarker*/|]def [|foo/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker'),
                        newText: 'foo(self, a: int) -> None:\n    return super().foo(a)',
                    },
                    additionalTextEdits: [
                        {
                            range: state.getPositionRange('importMarker'),
                            newText: 'from typing import override\n\n\n',
                        },
                        {
                            range: state.getPositionRange('overrideMarker'),
                            newText: '@override\n    ',
                        },
                    ],
                },
            ],
        },
    });
});

test('Complex type arguments', async () => {
    const code = `
${configEnableExplicitOverride}
// @filename: test.py
//// from typing import Generic, TypeVar, Any, List, Dict, Tuple, Mapping, Union
//// 
//// T = TypeVar("T")
//// 
//// class A(Generic[T]):
////     def foo(self, a: T) -> T:
////         return a
////
//// class B(A[Union[Tuple[list, dict], tuple[Mapping[List[A[int]], Dict[str, Any]], float]]]):
////     pass

// @filename: test1.py
//// [|/*importMarker*/|]from test import B
//// 
//// class U(B):
////     [|/*overrideMarker*/|]def [|foo/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    state.openFiles(state.testData.files.map((f) => f.fileName));

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    label: 'foo',
                    kind: CompletionItemKind.Method,
                    textEdit: {
                        range: state.getPositionRange('marker'),
                        newText: 'foo(self, a: T) -> T:\n    return super().foo(a)',
                    },
                    additionalTextEdits: [
                        {
                            range: state.getPositionRange('importMarker'),
                            newText: 'from typing import override\n\n',
                        },
                        {
                            range: state.getPositionRange('overrideMarker'),
                            newText: '@override\n    ',
                        },
                    ],
                },
            ],
        },
    });
});

test('Enum member', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// 
//// class MyEnum(Enum):
////     this = 1
////     that = 2
//// 
//// print(MyEnum.[|/*marker*/|])
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'this',
                    kind: CompletionItemKind.EnumMember,
                    documentation: '```python\nthis: int\n```',
                },
            ],
        },
    });
});

test('no member of Enum member', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// 
//// class MyEnum(Enum):
////     this = 1
////     that = 2
//// 
//// print(MyEnum.this.[|/*marker*/|])
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('excluded', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'this',
                    kind: undefined,
                },
                {
                    label: 'that',
                    kind: undefined,
                },
            ],
        },
    });
});

test('default Enum member', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// 
//// class MyEnum(Enum):
////     MemberOne = []
//// 
//// MyEnum.MemberOne.[|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'name',
                    kind: CompletionItemKind.Property,
                },
                {
                    label: 'value',
                    kind: CompletionItemKind.Property,
                },
            ],
        },
    });
});

test('str-backed Enum comparison suggests member values', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
////
//// class Mode(str, Enum):
////     Train = "train"
////     Test = "test"
////
//// config: Mode = Mode("train")
////
//// if config == [|"/*marker*/"|]:
////     pass
`;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"train"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"train"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"test"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"test"' },
                },
            ],
        },
    });
});

test('TypeDict literal values', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict, Literal
//// 
//// class DataA(TypedDict):
////     name: Literal["a", "b"] | None
//// 
//// data_a: DataA = {
////     "name": [|"/*marker*/"|]
//// }
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: '"a"',
                    kind: CompletionItemKind.Constant,
                    textEdit: { range: state.getPositionRange('marker'), newText: '"a"' },
                },
                {
                    label: '"b"',
                    kind: CompletionItemKind.Constant,
                    textEdit: { range: state.getPositionRange('marker'), newText: '"b"' },
                },
            ],
        },
    });
});

test('typed dict key constructor completion', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict
//// 
//// class Movie(TypedDict):
////    key1: str
//// 
//// a = Movie(k[|"/*marker*/"|])
//// 
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', MarkupKind.Markdown, {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Variable,
                    label: 'key1=',
                },
            ],
        },
    });
});

test('import from completion for namespace package', async () => {
    const code = `
// @filename: test.py
//// from nest1 import [|/*marker*/|]

// @filename: nest1/nest2/__init__.py
//// # empty

// @filename: nest1/module.py
//// # empty
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'nest2',
                    kind: CompletionItemKind.Module,
                },
                {
                    label: 'module',
                    kind: CompletionItemKind.Module,
                },
            ],
        },
    });
});

test('members off enum member', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// class Planet(Enum):
////     MERCURY = (3.303e+23, 2.4397e6)
////     EARTH   = (5.976e+24, 6.37814e6)
////
////     def __init__(self, mass, radius):
////         self.mass = mass       # in kilograms
////         self.radius = radius   # in meters
////
////     @property
////     def surface_gravity(self):
////         # universal gravitational constant  (m3 kg-1 s-2)
////         G = 6.67300E-11
////         return G * self.mass / (self.radius * self.radius)
////
//// Planet.EARTH.[|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('excluded', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'MERCURY',
                    kind: CompletionItemKind.EnumMember,
                },
                {
                    label: 'EARTH',
                    kind: CompletionItemKind.EnumMember,
                },
            ],
        },
    });

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'mass',
                    kind: CompletionItemKind.Variable,
                },
                {
                    label: 'radius',
                    kind: CompletionItemKind.Variable,
                },
                {
                    label: 'surface_gravity',
                    kind: CompletionItemKind.Property,
                },
            ],
        },
    });
});

test('handle missing close paren case', async () => {
    const code = `
// @filename: test.py
//// count=100
//// while count <= (c[|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'count',
                    kind: CompletionItemKind.Variable,
                },
            ],
        },
    });
});

test('enum with regular base type', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// from datetime import timedelta
//// class Period(timedelta, Enum):
////     Today = -1
////
//// Period.Today.[|/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'days',
                    kind: CompletionItemKind.Property,
                },
                {
                    label: 'seconds',
                    kind: CompletionItemKind.Property,
                },
            ],
        },
    });
});

test('enum assignment in __init__', async () => {
    const code = `
// @filename: test.py
//// from enum import Enum
//// class Foz(Enum):
////     a = "1"
////     b = "2"
////     class Fox(Enum):
////         c = 3
//// class C:
////     def __init__(self) -> None:
////         self.a: Foz = /*foz*/
////         self.b: Foz.Fox = /*fox*/
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['foz']: {
            completions: [
                { label: 'Foz.a', kind: CompletionItemKind.EnumMember },
                { label: 'Foz.b', kind: CompletionItemKind.EnumMember },
            ],
        },
        ['fox']: {
            completions: [{ label: 'Foz.Fox.c', kind: CompletionItemKind.EnumMember }],
        },
    });
});

test('enum assignment with unions', async () => {
    const code = `
// @filename: lib.py
//// from enum import Enum
//// class Foz(Enum):
////     a = "1"
////     b = "2"
////     class Fox(Enum):
////         c = 3

// @filename: test.py
//// from enum import Enum
//// from lib import Foz as Orb
//// class Foo(Enum):
////     a = "1"
////     b = "2"
////     class Fox(Enum):
////         c = 3
//// def f():
////     from lib import Foz as Fob
////     a: Foo.Fox | Orb.Fox = /*a*/
////     b: Foo | Orb = /*b*/
////     return a, b
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['a']: {
            completions: [
                { label: 'Foo.Fox.c', kind: CompletionItemKind.EnumMember },
                { label: 'Orb.Fox.c', kind: CompletionItemKind.EnumMember },
                { label: 'Fob.Fox.c', kind: CompletionItemKind.EnumMember },
            ],
        },
        ['b']: {
            completions: [
                { label: 'Foo.a', kind: CompletionItemKind.EnumMember },
                { label: 'Foo.b', kind: CompletionItemKind.EnumMember },
                { label: 'Orb.a', kind: CompletionItemKind.EnumMember },
                { label: 'Orb.b', kind: CompletionItemKind.EnumMember },
                { label: 'Fob.a', kind: CompletionItemKind.EnumMember },
                { label: 'Fob.b', kind: CompletionItemKind.EnumMember },
            ],
        },
    });
});

test('enum assignment with import', async () => {
    const code = `
// @filename: lib/__init__.py
//// from enum import Enum
//// class Foz(Enum):
////     a = "1"
////     b = "2"
////     class Fox(Enum):
////         c = 3
//// class C:
////     def __init__(self) -> None:
////         self.a: Foz = Foz.a
////         self.b: Foz.Fox = Foz.Fox.c

// @filename: test.py
//// import lib
//// c = lib.C()
//// c.a = /*a*/
//// c.b = /*b*/
//// d: lib.Foz.Fox = /*d*/
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['a']: {
            completions: [
                { label: 'lib.Foz.a', kind: CompletionItemKind.EnumMember },
                { label: 'lib.Foz.b', kind: CompletionItemKind.EnumMember },
            ],
        },
        ['b']: {
            completions: [{ label: 'lib.Foz.Fox.c', kind: CompletionItemKind.EnumMember }],
        },
        ['d']: {
            completions: [{ label: 'lib.Foz.Fox.c', kind: CompletionItemKind.EnumMember }],
        },
    });
});

test('enum assignment with import from', async () => {
    const code = `
// @filename: lib/__init__.py
//// from enum import IntEnum, StrEnum
//// class Foz(StrEnum):
////     a = "1"
////     b = "2"
////     class Fox(IntEnum):
////         c = 3
//// class C:
////     def __init__(self) -> None:
////         self.a: Foz = Foz.a
////         self.b: Foz.Fox = Foz.Fox.c

// @filename: test.py
//// from lib import C
//// c = C()
//// c.a = /*a*/
//// c.b = /*b*/
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['a']: {
            completions: [
                { label: 'Foz.a', kind: CompletionItemKind.EnumMember, detail: 'Auto-import' },
                { label: 'Foz.b', kind: CompletionItemKind.EnumMember, detail: 'Auto-import' },
            ],
        },
        ['b']: {
            completions: [{ label: 'Foz.Fox.c', kind: CompletionItemKind.EnumMember, detail: 'Auto-import' }],
        },
    });
});

test('inaccessible enum', async () => {
    const code = `
// @filename: test.py
//// from enum import IntEnum
//// def f():
////     class T:
////         class E(IntEnum):
////             a = 2
////             b = 5
////     return T.E.a
//// a = f()
//// _ = a == /*a*/
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('excluded', 'markdown', {
        ['a']: {
            completions: [
                { label: 'f.T.E.a', kind: CompletionItemKind.EnumMember },
                { label: 'f.T.E.b', kind: CompletionItemKind.EnumMember },
                { label: 'T.E.a', kind: CompletionItemKind.EnumMember },
                { label: 'T.E.b', kind: CompletionItemKind.EnumMember },
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
                { label: 'E.b', kind: CompletionItemKind.EnumMember },
            ],
        },
    });
});

test('enum/bool/literal assignment', async () => {
    const code = `
// @filename: lib/__init__.py
//// from enum import IntEnum
//// from typing import Literal
//// class Foz(IntEnum):
////     a = 1
////     b = 2

// @filename: test.py
//// from enum import Enum
//// from typing import Literal
//// import lib
//// class E(Enum):
////     a = "1"
////     b = "2"
//// a: Literal[E.a, "c"] = /*a*/
//// b: Literal["a", "c", True] = /*b*/
//// c: Literal["a", 3, lib.Foz.b] = /*c*/
//// d: E | Literal["a", 3] | bool = /*d*/
//// e: bool = /*e*/
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['a']: {
            completions: [
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
                { label: '"c"', kind: CompletionItemKind.Constant },
            ],
        },
        ['b']: {
            completions: [
                { label: '"a"', kind: CompletionItemKind.Constant },
                { label: '"c"', kind: CompletionItemKind.Constant },
                { label: 'True', kind: CompletionItemKind.Constant },
            ],
        },
        ['c']: {
            completions: [
                { label: '"a"', kind: CompletionItemKind.Constant },
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'lib.Foz.b', kind: CompletionItemKind.EnumMember },
            ],
        },
        ['d']: {
            completions: [
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
                { label: 'E.b', kind: CompletionItemKind.EnumMember },
                { label: '"a"', kind: CompletionItemKind.Constant },
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'True', kind: CompletionItemKind.Constant },
                { label: 'False', kind: CompletionItemKind.Constant },
            ],
        },
        ['e']: {
            completions: [
                { label: 'True', kind: CompletionItemKind.Constant },
                { label: 'False', kind: CompletionItemKind.Constant },
            ],
        },
    });
});

test('enum/bool/literal operators', async () => {
    const code = `
// @filename: test.py
//// from enum import StrEnum
//// from typing import Literal
//// class E(StrEnum):
////     a = "a"
////     b = "b"
//// def f(c: Literal[3, E.a, "c"], d: Literal[3, E.a]):
////     _ = c == /*m0*/
////     _ = d != /*m1*/
////     (c := /*m2*/)
////     match d:
////         case E.a:
////             ...
////         case /*m3*/
////     `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['m0']: {
            completions: [
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
                { label: '"c"', kind: CompletionItemKind.Constant },
            ],
        },
        ['m1']: {
            completions: [
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
            ],
        },
        ['m2']: {
            completions: [
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
                { label: '"c"', kind: CompletionItemKind.Constant },
            ],
        },
        ['m3']: {
            completions: [
                { label: '3', kind: CompletionItemKind.Constant },
                { label: 'E.a', kind: CompletionItemKind.EnumMember },
            ],
        },
    });
});

test('enum/bool/literal union in function parameter', async () => {
    const code = `
// @filename: lib/__init__.py
//// from enum import Enum
//// from typing import Literal
//// class Foz:
////     class Fox(Enum):
////         c = 3
////         d = 4.0
//// def switch(a: Foz.Fox | bool | Literal[0, 1]):
////     if isinstance(a, bool):
////         return not a
////     if isinstance(a, int):
////         return 1 - a
////     return Foz.Fox.d if a == Foz.Fox.c else Foz.Fox.c

// @filename: test.py
//// from lib import switch
//// _ = switch(/*c*/)
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['c']: {
            completions: [
                { label: 'Foz.Fox.c', kind: CompletionItemKind.EnumMember, detail: 'Auto-import' },
                { label: 'False', kind: CompletionItemKind.Constant },
                { label: 'True', kind: CompletionItemKind.Constant },
                { label: '0', kind: CompletionItemKind.Constant },
                { label: '1', kind: CompletionItemKind.Constant },
            ],
        },
    });
});

test('import statements with implicit import', async () => {
    const code = `
// @filename: test.py
//// from lib import /*marker*/

// @filename: lib/__init__.py
//// from . import api as api

// @filename: lib/api.py
//// # Empty
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'api',
                    kind: CompletionItemKind.Module,
                },
            ],
        },
    });
});

test('overloaded Literal[...] suggestions in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import overload, Literal
////
//// @overload
//// def example(p: Literal["A"]): ...
//// @overload
//// def example(p: Literal["B"]): ...
//// @overload
//// def example(p: Literal["C"]): ...
//// def example(p):
////     pass
////
//// example([|"/*marker*/"|])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"A"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"A"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"B"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"B"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"C"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"C"' },
                },
            ],
        },
    });
});

test('collection literal suggestions in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Collection, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["nan"]] = ()) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str: ...
////
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str:
////     return ''
////
//// dumps(None, allow=[[|"/*marker*/"|]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('collection literal suggestions include all literal overload element candidates', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Collection, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["nan"]] = ()) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["inf"]] = ()) -> str: ...
////
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str:
////     return ''
////
//// dumps(None, allow=[[|"/*marker*/"|]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"inf"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"inf"' },
                },
            ],
        },
    });
});

test('collection literal suggestions exclude deeply nested containers in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Collection, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["nan"]] = ()) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str: ...
////
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str:
////     return ''
////
//// dumps(None, allow=[[[[|"/*marker*/"|]]]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('excluded', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('typing list literal suggestions in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, List, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: List[Literal["nan"]]) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: List[str]) -> str: ...
////
//// def dumps(obj: Any, *, allow: List[str]) -> str:
////     return ''
////
//// dumps(None, allow=[[|"/*marker*/"|]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('mapping value literal suggestions include all overload candidates', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Literal, Mapping, overload
////
//// @overload
//// def encode(obj: Any, *, mapping: Mapping[str, Literal["nan"]] = ...) -> str: ...
//// @overload
//// def encode(obj: Any, *, mapping: Mapping[str, Literal["inf"]] = ...) -> str: ...
////
//// def encode(obj: Any, *, mapping: Mapping[str, str] = ...) -> str:
////     return ''
////
//// encode(None, mapping={"key": [|"/*marker*/"|]})
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"inf"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"inf"' },
                },
            ],
        },
    });
});

test('sequence literal suggestions in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Literal, Sequence, overload
////
//// @overload
//// def encode(obj: Any, *, seq: Sequence[Literal["nan"]] = ...) -> str: ...
//// @overload
//// def encode(obj: Any, *, seq: Sequence[str] = ...) -> str: ...
////
//// def encode(obj: Any, *, seq: Sequence[str] = ...) -> str:
////     return ''
////
//// encode(None, seq=[[|"/*marker*/"|]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('collection literal suggestions include comprehensions in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Collection, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["nan"]] = ()) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str: ...
////
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str:
////     return ''
////
//// dumps(None, allow=[[|"/*marker*/"|] for _ in range(1)])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('collection literal suggestions exclude lambdas in call arguments', async () => {
    const code = `
// @filename: test.py
//// from typing import Any, Collection, Literal, overload
////
//// @overload
//// def dumps(obj: Any, *, allow: Collection[Literal["nan"]] = ()) -> str: ...
//// @overload
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str: ...
////
//// def dumps(obj: Any, *, allow: Collection[str] = ()) -> str:
////     return ''
////
//// dumps(None, allow=[lambda: [|"/*marker*/"|]])
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    await state.verifyCompletion('excluded', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"nan"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"nan"' },
                },
            ],
        },
    });
});

test('nested TypedDict completion with Unpack - without other fields', async () => {
    const code = `
// @filename: test.py
//// from typing import Unpack, TypedDict
////
//// class InnerDict(TypedDict):
////     a: int
////     b: str
////
//// class OuterDict(TypedDict):
////     inner: InnerDict
////     field_1: str
////
//// def test_inner_dict(**kwargs: Unpack[OuterDict]):
////     pass
////
//// test_inner_dict(inner={[|/*marker*/|]})
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: "'a'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'a'" },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: "'b'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'b'" },
                },
            ],
        },
    });
});

test('nested TypedDict completion with Unpack - with other fields', async () => {
    const code = `
// @filename: test.py
//// from typing import Unpack, TypedDict
////
//// class InnerDict(TypedDict):
////     a: int
////     b: str
////
//// class OuterDict(TypedDict):
////     inner: InnerDict
////     field_1: str
////
//// def test_inner_dict(**kwargs: Unpack[OuterDict]):
////     pass
////
//// test_inner_dict(field_1="test", inner={[|/*marker*/|]})
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"a"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"a"' },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: '"b"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"b"' },
                },
            ],
        },
    });
});

test('simple nested TypedDict completion - no Unpack', async () => {
    const code = `
// @filename: test.py
//// from typing import TypedDict
////
//// class InnerDict(TypedDict):
////     a: int
////     b: str
////
//// def test_func(inner: InnerDict):
////     pass
////
//// test_func(inner={[|/*marker*/|]})
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: "'a'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'a'" },
                },
                {
                    kind: CompletionItemKind.Constant,
                    label: "'b'",
                    textEdit: { range: state.getPositionRange('marker'), newText: "'b'" },
                },
            ],
        },
    });
});

test('TypedDict subscript completion with Literal assignment target', async () => {
    const code = `
// @filename: test.py
//// from typing import Literal, TypedDict, TypeAlias
////
//// SomeLiterals: TypeAlias = Literal["literal1", "literal2"]
////
//// class Settings(TypedDict):
////     value: SomeLiterals
////
//// class Test:
////     def __init__(self) -> None:
////         self.settings: Settings = {"value": "literal1"}
////
////     def meth(self, literal: SomeLiterals):
////         literal = self.settings[[|/*marker*/|]]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    kind: CompletionItemKind.Constant,
                    label: '"value"',
                    textEdit: { range: state.getPositionRange('marker'), newText: '"value"' },
                },
            ],
        },
    });

    await state.verifyCompletion('excluded', 'markdown', {
        marker: {
            completions: [
                {
                    label: '"literal1"',
                    kind: CompletionItemKind.Constant,
                },
                {
                    label: '"literal2"',
                    kind: CompletionItemKind.Constant,
                },
            ],
        },
    });
});

test('completion itemDefaults.data hoist when capability enabled', async () => {
    const code = `
// @filename: test.py
//// def my_function(): ...
//// my_/*marker*/
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        completionItemDataDefault: true,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        uri,
        position,
        options,
        CancellationToken.None,
        false
    ).getCompletions();

    assert(result);
    assert(result.items.length > 0);

    // The shared `uri`/`position` are hoisted into `itemDefaults.data`, and the client is told to
    // merge it back per item via `applyKind.data === Merge`.
    assert.deepStrictEqual(result.itemDefaults?.data, { uri: uri.toString(), position });
    assert.strictEqual(result.applyKind?.data, ApplyKind.Merge);

    const item = result.items.find((i) => i.label === 'my_function');
    assert(item);

    // Per-item data no longer carries the duplicated `uri`/`position`, but retains item-specific fields.
    const itemData = item.data as Partial<CompletionItemData>;
    assert.strictEqual(itemData.uri, undefined);
    assert.strictEqual(itemData.position, undefined);
    assert.strictEqual(itemData.symbolLabel, 'my_function');
});

test('completion itemDefaults.data not hoisted when capability disabled', async () => {
    const code = `
// @filename: test.py
//// def my_function(): ...
//// my_/*marker*/
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    const filePath = marker.fileName;
    const uri = Uri.file(filePath, state.serviceProvider);
    const position = state.convertOffsetToPosition(filePath, marker.position);

    const options: CompletionOptions = {
        format: 'markdown',
        snippet: false,
        lazyEdit: false,
        checkDeprecatedWhenResolving: false,
        useTypingExtensions: false,
    };

    const result = new CompletionProvider(
        state.program,
        uri,
        position,
        options,
        CancellationToken.None,
        false
    ).getCompletions();

    assert(result);
    assert.strictEqual(result.itemDefaults?.data, undefined);
    assert.strictEqual(result.applyKind, undefined);

    const item = result.items.find((i) => i.label === 'my_function');
    assert(item);

    // Without the capability, each item still carries the full `uri`/`position` payload.
    const itemData = item.data as Partial<CompletionItemData>;
    assert.strictEqual(itemData.uri, uri.toString());
    assert.deepStrictEqual(itemData.position, position);
});

test('dataclass field alias with invalid python identifier', async () => {
    const code = `
// @filename: test.py
//// from typing import dataclass_transform
////
////
//// def field[T](*, init: bool = True, default: T | None = None, alias: str | None = None) -> T: ...
////
//// @dataclass_transform(field_specifiers=(field,))
//// class Foo(type):...
////
//// class Bar(metaclass=Foo):...
////
//// class Baz(Bar):
////     a: int = field(alias='foo bar')
////     b: str = field(alias='baz')
////
//// Baz([|/*marker*/|])
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion('included', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'baz=',
                    kind: CompletionItemKind.Variable,
                },
            ],
        },
    });
    await state.verifyCompletion('excluded', 'markdown', {
        ['marker']: {
            completions: [
                {
                    label: 'foo bar=',
                    kind: CompletionItemKind.Variable,
                },
            ],
        },
    });
});

describe('deprecated', () => {
    test('completionItem/resolve supported', async () => {
        const code = `
// @filename: test.py
//// from typing_extensions import deprecated
////
////
//// @deprecated('asdf')
//// def asdfasdf(): ...
////
//// asdfasd[|/*marker*/|]
    `;

        const state = parseAndGetTestState(code).state;

        await state.verifyCompletion(
            'included',
            'markdown',
            {
                ['marker']: {
                    completions: [
                        {
                            label: 'asdfasdf',
                            kind: CompletionItemKind.Function,
                            tags: [CompletionItemTag.Deprecated],
                        },
                    ],
                },
            },
            undefined,
            true
        );
    });
    test('completionItem/resolve not supported', async () => {
        const code = `
// @filename: test.py
//// from typing_extensions import deprecated
////
////
//// @deprecated('asdf')
//// def asdfasdf(): ...
////
//// asdfasd[|/*marker*/|]
    `;

        const state = parseAndGetTestState(code).state;

        await state.verifyCompletion('included', 'markdown', {
            ['marker']: {
                completions: [
                    {
                        label: 'asdfasdf',
                        kind: CompletionItemKind.Function,
                        tags: [CompletionItemTag.Deprecated],
                    },
                ],
            },
        });
    });
    test('deprecated typing aliases', async () => {
        const code = `
// @filename: pyrightconfig.json
//// {
////   "deprecateTypingAliases": true
//// }

// @filename: test.py
//// [|/*importMarker*/|][|Lis/*marker*/|]
    `;

        const state = parseAndGetTestState(code).state;

        await state.verifyCompletion('included', 'markdown', {
            ['marker']: {
                completions: [
                    {
                        label: 'List',
                        kind: CompletionItemKind.Variable,
                        tags: [CompletionItemTag.Deprecated],
                        detail: 'Auto-import',
                        textEdit: {
                            range: state.getPositionRange('marker'),
                            newText: 'List',
                        },
                        additionalTextEdits: [
                            {
                                range: state.getPositionRange('importMarker'),
                                newText: 'from typing import List\n\n\n',
                            },
                        ],
                    },
                ],
            },
        });
    });

    // see https://github.com/DetachHead/basedpyright/issues/1149
    test('disabled on typevar bounds', async () => {
        const code = `
// @filename: test.py
//// from warnings import deprecated
////
////
//// @deprecated('asdf')
//// class Asdf: ...
////
//// class Foo[T: Asd[|/*marker*/|] = str]:
////     def __init__(self, default: tuple[T, ...] = (69,)) -> None:
////         pass
    `;

        const state = parseAndGetTestState(code).state;

        await state.verifyCompletion('included', 'markdown', {
            ['marker']: {
                completions: [
                    {
                        label: 'Asdf',
                        kind: CompletionItemKind.Class,
                    },
                ],
            },
        });
    });
});

describe('useTypingExtensions', () => {
    describe('python <3.12', () => {
        test('@override decorator useTypingExtensions=true', async () => {
            const code = `
// @filename: pyrightconfig.json
//// { "pythonVersion": "3.9", "reportImplicitOverride": "error" }
// @filename: test.py
//// [|/*importMarker*/|]class Foo:
////     def foo(self): ...
////
//// class Bar(Foo):
////     [|/*overrideMarker*/|]def [|fo/*marker*/|]
    `;

            const state = parseAndGetTestState(code).state;

            await state.verifyCompletion(
                'included',
                'markdown',
                {
                    ['marker']: {
                        completions: [
                            {
                                label: 'foo',
                                kind: CompletionItemKind.Method,
                                textEdit: {
                                    range: state.getPositionRange('marker'),
                                    newText: 'foo(self):\n    return super().foo()',
                                },
                                additionalTextEdits: [
                                    {
                                        range: state.getPositionRange('importMarker'),
                                        newText: 'from typing_extensions import override\n\n\n',
                                    },
                                    {
                                        range: state.getPositionRange('overrideMarker'),
                                        newText: '@override\n    ',
                                    },
                                ],
                            },
                        ],
                    },
                },
                undefined,
                undefined,
                true
            );
        });

        test('@override decorator useTypingExtensions=false', async () => {
            const code = `
// @filename: pyrightconfig.json
//// { "pythonVersion": "3.9", "reportImplicitOverride": "error" }
// @filename: test.py
//// [|/*importMarker*/|]class Foo:
////     def foo(self): ...
////
//// class Bar(Foo):
////     [|/*overrideMarker*/|]def [|fo/*marker*/|]
    `;

            const state = parseAndGetTestState(code).state;

            await state.verifyCompletion(
                'included',
                'markdown',
                {
                    ['marker']: {
                        completions: [
                            {
                                label: 'foo',
                                kind: CompletionItemKind.Method,
                                textEdit: {
                                    range: state.getPositionRange('marker'),
                                    newText: 'foo(self):\n    return super().foo()',
                                },
                                additionalTextEdits: [],
                            },
                        ],
                    },
                },
                undefined,
                undefined,
                false
            );
        });
    });
    describe('python >=3.12', () => {
        test('@override decorator useTypingExtensions=true', async () => {
            const code = `
// @filename: pyrightconfig.json
//// { "pythonVersion": "3.13", "reportImplicitOverride": "error" }
// @filename: test.py
//// [|/*importMarker*/|]class Foo:
////     def foo(self): ...
////
//// class Bar(Foo):
////     [|/*overrideMarker*/|]def [|fo/*marker*/|]
    `;

            const state = parseAndGetTestState(code).state;

            await state.verifyCompletion(
                'included',
                'markdown',
                {
                    ['marker']: {
                        completions: [
                            {
                                label: 'foo',
                                kind: CompletionItemKind.Method,
                                textEdit: {
                                    range: state.getPositionRange('marker'),
                                    newText: 'foo(self):\n    return super().foo()',
                                },
                                additionalTextEdits: [
                                    {
                                        range: state.getPositionRange('importMarker'),
                                        newText: 'from typing import override\n\n\n',
                                    },
                                    {
                                        range: state.getPositionRange('overrideMarker'),
                                        newText: '@override\n    ',
                                    },
                                ],
                            },
                        ],
                    },
                },
                undefined,
                undefined,
                true
            );
        });

        test('@override decorator useTypingExtensions=false', async () => {
            const code = `
// @filename: pyrightconfig.json
//// { "pythonVersion": "3.13", "reportImplicitOverride": "error" }
// @filename: test.py
//// [|/*importMarker*/|]class Foo:
////     def foo(self): ...
////
//// class Bar(Foo):
////     [|/*overrideMarker*/|]def [|fo/*marker*/|]
    `;

            const state = parseAndGetTestState(code).state;

            await state.verifyCompletion(
                'included',
                'markdown',
                {
                    ['marker']: {
                        completions: [
                            {
                                label: 'foo',
                                kind: CompletionItemKind.Method,
                                textEdit: {
                                    range: state.getPositionRange('marker'),
                                    newText: 'foo(self):\n    return super().foo()',
                                },
                                additionalTextEdits: [
                                    {
                                        range: state.getPositionRange('importMarker'),
                                        newText: 'from typing import override\n\n\n',
                                    },
                                    {
                                        range: state.getPositionRange('overrideMarker'),
                                        newText: '@override\n    ',
                                    },
                                ],
                            },
                        ],
                    },
                },
                undefined,
                undefined,
                false
            );
        });
    });
});

test('typing_extensions auto-import should be placed in third-party section', async () => {
    const code = `
// @filename: pyrightconfig.json
//// { "pythonVersion": "3.10" }

// @filename: test.py
//// from unittest import TestCase[|/*importMarker*/|]
////
//// [|override/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    // If it's stdlib, it will be placed alphabetically before unittest (old bugged behavior)
    await state.verifyCompletion(
        'included',
        'markdown',
        {
            ['marker']: {
                completions: [
                    {
                        label: 'override',
                        kind: CompletionItemKind.Function,
                        detail: 'Auto-import',
                        textEdit: {
                            range: state.getPositionRange('marker'),
                            newText: 'override',
                        },
                        additionalTextEdits: [
                            {
                                range: state.getPositionRange('importMarker'),
                                newText: '\n\nfrom typing_extensions import override',
                            },
                        ],
                    },
                ],
            },
        },
        undefined,
        undefined,
        false
    );
});

test('import from stdlib package', async () => {
    const code = `
// @filename: test.py
//// [|/*marker0*/|]
//// [|/*importMarker*/|][|JSONDecodeErr/*marker*/|]
    `;

    const state = parseAndGetTestState(code).state;

    await state.verifyCompletion(
        'included',
        'markdown',
        {
            ['marker']: {
                completions: [
                    {
                        label: 'JSONDecodeError',
                        kind: CompletionItemKind.Class,
                        detail: 'Auto-import',
                        textEdit: {
                            range: state.getPositionRange('marker'),
                            newText: 'JSONDecodeError',
                        },
                        additionalTextEdits: [
                            {
                                range: state.getPositionRange('importMarker'),
                                newText: 'from json import JSONDecodeError\n\n\n',
                            },
                        ],
                    },
                ],
            },
        },
        undefined,
        undefined,
        false
    );
});
