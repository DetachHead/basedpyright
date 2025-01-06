/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "autoImportCompletions": false
//// }

// @filename: test.py
//// [|/*import*/|]foo[|/*noImportMarker*/|]: [|/*startMarker*/|][|TracebackType/*range*/|][|/*endMarker*/|]
{
    const importRange = helper.getPositionRange('import');
    const symbolRange = helper.getPositionRange('range');

    const codeActions = {
        codeActions: [
            {
                title: `from types import TracebackType`,
                edit: {
                    changes: {
                        'file:///test.py': [
                            // this is a useless TextEdit that replaces the text with the same thing, probably because
                            // it needs to change it to prepend a module name if the whole module is already imported
                            { range: symbolRange, newText: 'TracebackType' },
                            { range: importRange, newText: 'from types import TracebackType\n\n\n' },
                        ],
                    },
                },
                kind: 'quickfix',
            },
        ],
    };

    //@ts-expect-error https://github.com/DetachHead/basedpyright/issues/86
    await helper.verifyCodeActions('included', {
        noImportMarker: { codeActions: [] },
        startMarker: codeActions,
        endMarker: codeActions,
    });
}
