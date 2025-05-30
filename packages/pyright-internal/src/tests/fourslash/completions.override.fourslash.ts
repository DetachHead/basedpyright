/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }

// @filename: test.py
//// [|/*importMarker*/|]class B:
////     def method1(self, a: str, *args, **kwargs):
////         pass
////
////     def method2(self, b, /, *args):
////         pass
////
////     def method3(self, b, *, c: str):
////         pass
////
//// class C(B):
////     [|/*overrideMarker*/|]def [|method/*marker*/|]

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
                label: 'method1',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method1(self, a: str, *args, **kwargs):\n    return super().method1(a, *args, **kwargs)',
                },
                additionalTextEdits,
            },
            {
                label: 'method2',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method2(self, b, /, *args):\n    return super().method2(b, *args)',
                },
                additionalTextEdits,
            },
            {
                label: 'method3',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method3(self, b, *, c: str):\n    return super().method3(b, c=c)',
                },
                additionalTextEdits,
            },
        ],
    },
});
