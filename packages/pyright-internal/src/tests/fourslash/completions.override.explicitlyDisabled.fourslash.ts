/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "none"
//// }

// @filename: test.py
//// class B:
////     def method_1(self, a: str, *args, **kwargs):
////         pass
////
////     @property
////     def method_2(self) -> int:
////         pass
////
////     @classmethod
////     def method_3(self, b) -> str:
////         pass
////
////     @staticmethod
////     def method_4(self, b) -> str:
////         pass
////
//// class C(B):
////     def [|method/*marker*/|]

// @ts-ignore
await helper.verifyCompletion('included', 'markdown', {
    marker: {
        completions: [
            {
                label: 'method_1',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method_1(self, a: str, *args, **kwargs):\n    return super().method_1(a, *args, **kwargs)',
                },
            },
            {
                label: 'method_2',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method_2(self) -> int:\n    return super().method_2',
                },
            },
            {
                label: 'method_3',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method_3(self, b) -> str:\n    return super().method_3(b)',
                },
            },
            {
                label: 'method_4',
                kind: Consts.CompletionItemKind.Method,
                textEdit: {
                    range: helper.getPositionRange('marker'),
                    newText: 'method_4(self, b) -> str:\n    return super().method_4(b)',
                },
            },
        ],
    },
});
