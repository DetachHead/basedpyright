/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }

// @filename: test.pyi
//// [|/*importMarker*/|]class B:
////     @property
////     def prop(self):
////         return 1
////
////     @prop.setter
////     def prop(self, value):
////         pass
////
//// class C(B):
////     @property
////     [|/*overrideMarker*/|]def [|pr/*marker*/|]

const additionalTextEdits = [
    {
        range: helper.getPositionRange('importMarker'),
        newText: 'from typing import override\n\n\n',
    },
    {
        range: helper.getPositionRange('overrideMarker'),
        newText: '@override\n    ',
    },
];

// @ts-ignore
await helper.verifyCompletion('included', 'markdown', {
    marker: {
        completions: [
            {
                label: 'prop',
                kind: Consts.CompletionItemKind.Property,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'prop(self): ...',
                },
                additionalTextEdits,
            },
        ],
    },
});
