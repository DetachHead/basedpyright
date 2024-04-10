/// <reference path="fourslash.ts" />

// @filename: pyrightconfig.json
//// {}

// @filename: test.py
//// [|/*import*/|]foo[|/*noImportMarker*/|]: [|/*startMarker*/|]TracebackType[|/*endMarker*/|]

const importRange = helper.getPositionRange('import');

const codeActions = {
    codeActions: [
        {
            title: `from types import TracebackType`,
            edit: {
                changes: {
                    'file:///test.py': [{ range: importRange, newText: 'from types import TracebackType\n\n\n' }],
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
