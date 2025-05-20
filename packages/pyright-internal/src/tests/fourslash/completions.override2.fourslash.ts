/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportImplicitOverride": "error"
//// }

// @filename: test.py
//// [|/*importMarker1*/|]class B(list):
////     [|/*overrideMarker1*/|]def [|append/*marker*/|]

// @filename: test1.py
//// class A:
////     def __init__(self, *args, **kwargs):
////         pass
////
//// class B(A):
////     def [|__init__/*marker1*/|]

// @filename: test2.py
//// class A:
////     def [|__class__/*marker2*/|]

// @filename: test3.py
//// [|/*importMarker3*/|]class A:
////     [|/*overrideMarker3*/|]def [|__call__/*marker3*/|]

const additionalTextEdits = (markerNumber: number) => [
    {
        range: helper.getPositionRange(`importMarker${markerNumber}`),
        newText: 'from typing import override\n\n\n',
    },
    {
        range: helper.getPositionRange(`overrideMarker${markerNumber}`),
        newText: '@override\n    ',
    },
];

{
    helper.openFiles(helper.getMarkers().map((m) => m.fileName));

    // @ts-ignore
    await helper.verifyCompletion('included', 'markdown', {
        marker: {
            completions: [
                {
                    label: 'append',
                    kind: Consts.CompletionItemKind.Method,
                    textEdit: {
                        range: helper.getPositionRange('marker'),
                        newText: 'append(self, object: _T, /) -> None:\n    return super().append(object)',
                    },
                    additionalTextEdits: additionalTextEdits(1),
                },
            ],
        },
        marker1: {
            completions: [
                {
                    label: '__init__',
                    kind: Consts.CompletionItemKind.Method,
                    textEdit: {
                        range: helper.getPositionRange('marker1'),
                        newText: '__init__(self, *args, **kwargs):\n    super().__init__(*args, **kwargs)',
                    },
                },
            ],
        },
        marker3: {
            completions: [
                {
                    label: '__call__',
                    kind: Consts.CompletionItemKind.Method,
                    textEdit: {
                        range: helper.getPositionRange('marker3'),
                        newText: '__call__(self, *args: Any, **kwds: Any) -> Any:\n    ${0:pass}',
                    },
                },
            ],
        },
    });

    // @ts-ignore
    await helper.verifyCompletion('excluded', 'markdown', {
        // Only method shows up. __class__ is property
        marker2: { completions: [{ label: '__class__', kind: undefined }] },
    });
}
