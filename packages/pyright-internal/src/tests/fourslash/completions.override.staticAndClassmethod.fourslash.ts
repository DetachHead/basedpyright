/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }

// @filename: test.py
//// [|/*importMarker*/|]class A:
////     @staticmethod
////     def smethod(a, b):
////         pass
////
////     @classmethod
////     def cmethod(cls, a):
////         pass
////
//// class B1(A):
////     [|/*overrideMarker1*/|]def [|m/*marker1*/|]
////
//// class B2(A):
////     @staticmethod
////     [|/*overrideMarker2*/|]def [|m/*marker2*/|]
////
//// class B3(A):
////     @classmethod
////     [|/*overrideMarker3*/|]def [|m/*marker3*/|]

const overrideDecoratorText = '@override\n    ';

const additionalTextEdits = (markerNumber: number) => [
    {
        range: helper.getPositionRange('importMarker'),
        newText: 'from typing import override\n\n\n',
    },
    {
        range: helper.getPositionRange(`overrideMarker${markerNumber}`),
        newText: overrideDecoratorText,
    },
];

{
    // @ts-ignore
    await helper.verifyCompletion('included', 'markdown', {
        marker2: {
            completions: [
                {
                    label: 'smethod',
                    kind: Consts.CompletionItemKind.Method,
                    textEdit: {
                        range: helper.getPositionRange('marker2'),
                        newText: 'smethod(a, b):\n    return super().smethod(a, b)',
                    },
                    additionalTextEdits: additionalTextEdits(2),
                },
            ],
        },
        marker3: {
            completions: [
                {
                    label: 'cmethod',
                    kind: Consts.CompletionItemKind.Method,
                    textEdit: {
                        range: helper.getPositionRange('marker3'),
                        newText: 'cmethod(cls, a):\n    return super().cmethod(a)',
                    },
                    additionalTextEdits: additionalTextEdits(3),
                },
            ],
        },
    });

    // @ts-ignore
    await helper.verifyCompletion('excluded', 'markdown', {
        marker1: {
            completions: [
                { label: 'smethod', kind: undefined },
                { label: 'cmethod', kind: undefined },
            ],
        },
        marker2: { completions: [{ label: 'cmethod', kind: undefined }] },
        marker3: { completions: [{ label: 'smethod', kind: undefined }] },
    });
}
