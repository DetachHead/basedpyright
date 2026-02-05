/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "typeCheckingMode": "recommended"
//// }

// @filename: test.py
//// class Foo:
////     def bar(self[|/*default*/ = None|]):
////         pass

{
    const defaultRange = helper.getPositionRange('default');
    const codeActionTitle = 'Remove default value from parameter';

    const codeActions = {
        codeActions: [
            {
                title: codeActionTitle,
                edit: {
                    changes: {
                        'file:///test.py': [{ range: defaultRange, newText: '' }],
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
