/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }

// @filename: test.py
//// [|/*importMarker*/|]class B:
////     def method1(self, a: str = 'hello', b: int = 1234):
////         pass
////
////     def method2(self, a=None):
////         pass
////
////     def method3(self, a=1234, b=object()):
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
                    newText: "method1(self, a: str = 'hello', b: int = 1234):\n    return super().method1(a, b)",
                },
                additionalTextEdits,
            },
            {
                label: 'method2',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method2(self, a=None):\n    return super().method2(a)',
                },
                additionalTextEdits,
            },
            {
                label: 'method3',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method3(self, a=1234, b=object()):\n    return super().method3(a, b)',
                },
                additionalTextEdits,
            },
        ],
    },
});
