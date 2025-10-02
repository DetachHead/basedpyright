/// <reference path="typings/fourslash.d.ts" />

// @filename: definitions.py
//// def foo_function() -> None:
////     pass
////
//// def bar_function() -> None:
////     pass

// @filename: reexports_with_all.py
//// from definitions import foo_function
//// __all__ = ["foo_function"]

// @filename: reexports_with_alias.py
//// from definitions import bar_function as bar_function

// @filename: test_all.py
//// [|/*import1*/|][|foo/*marker1*/|]

// @filename: test_alias.py
//// [|/*import2*/|][|bar/*marker2*/|]

{
    helper.openFile('/test_all.py');

    const import1Range = helper.getPositionRange('import1');
    const marker1Range = helper.getPositionRange('marker1');

    // @ts-ignore
    await helper.verifyCompletion('included', 'markdown', {
        marker1: {
            completions: [
                {
                    label: 'foo_function',
                    kind: Consts.CompletionItemKind.Function,
                    documentation: '```\nfrom reexports_with_all import foo_function\n```',
                    detail: 'Auto-import',
                    textEdit: { range: marker1Range, newText: 'foo_function' },
                    additionalTextEdits: [
                        { range: import1Range, newText: 'from reexports_with_all import foo_function\n\n\n' },
                    ],
                },
                {
                    label: 'foo_function',
                    kind: Consts.CompletionItemKind.Function,
                    documentation: '```\nfrom definitions import foo_function\n```',
                    detail: 'Auto-import',
                    textEdit: { range: marker1Range, newText: 'foo_function' },
                    additionalTextEdits: [
                        { range: import1Range, newText: 'from definitions import foo_function\n\n\n' },
                    ],
                },
            ],
        },
    });

    helper.openFile('/test_alias.py');

    const import2Range = helper.getPositionRange('import2');
    const marker2Range = helper.getPositionRange('marker2');

    // @ts-ignore
    await helper.verifyCompletion('included', 'markdown', {
        marker2: {
            completions: [
                {
                    label: 'bar_function',
                    kind: Consts.CompletionItemKind.Function,
                    documentation: '```\nfrom reexports_with_alias import bar_function\n```',
                    detail: 'Auto-import',
                    textEdit: { range: marker2Range, newText: 'bar_function' },
                    additionalTextEdits: [
                        { range: import2Range, newText: 'from reexports_with_alias import bar_function\n\n\n' },
                    ],
                },
                {
                    label: 'bar_function',
                    kind: Consts.CompletionItemKind.Function,
                    documentation: '```\nfrom definitions import bar_function\n```',
                    detail: 'Auto-import',
                    textEdit: { range: marker2Range, newText: 'bar_function' },
                    additionalTextEdits: [
                        { range: import2Range, newText: 'from definitions import bar_function\n\n\n' },
                    ],
                },
            ],
        },
    });
}
