/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "typeCheckingMode": "recommended"
//// }

// @filename: test.py
//// from typing import cast
//// def foo(x: int) -> int:
////     return [|/*cast*/cast(int, |]x[|/*castClosing*/)|]

{
    const castRange = helper.getPositionRange('cast');
    const castClosingRange = helper.getPositionRange('castClosing');
    const codeActionTitle = 'Remove unnecessary cast';

    const codeActions = {
        codeActions: [
            {
                title: codeActionTitle,
                edit: {
                    changes: {
                        'file:///test.py': [
                            { range: castRange, newText: '' },
                            { range: castClosingRange, newText: '' },
                        ],
                    },
                },
                kind: 'quickfix',
            },
        ],
    };

    //@ts-expect-error
    await helper.verifyCodeActions('included', {
        startMarker: codeActions,
        endMarker: codeActions,
    });
}
