/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "typeCheckingMode": "recommended"
//// }

// @filename: test.py
//// def foo() -> int:
////     ...
////
//// [|/*call*/|]foo()

{
    const callRange = helper.getPositionRange('call');
    const codeActionTitle = 'Assign result to _';

    const codeActions = {
        codeActions: [
            {
                title: codeActionTitle,
                edit: {
                    changes: {
                        'file:///test.py': [{ range: callRange, newText: '_ = ' }],
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
