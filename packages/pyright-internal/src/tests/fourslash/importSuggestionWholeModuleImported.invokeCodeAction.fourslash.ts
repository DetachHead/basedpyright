/// <reference path="fourslash.ts" />

// @filename: pyrightconfig.json
//// {}

// @filename: test.py
//// import types
//// foo: [|TracebackType/*textEditRange*/|][|/*marker*/|]
{
    const textEditRange = helper.getPositionRange('textEditRange');

    const codeActions = {
        codeActions: [
            {
                title: `from types import TracebackType`,
                edit: {
                    changes: {
                        'file:///test.py': [{ range: textEditRange, newText: 'types.TracebackType' }],
                    },
                },
                kind: 'quickfix',
            },
        ],
    };

    //@ts-expect-error https://github.com/DetachHead/basedpyright/issues/86
    await helper.verifyCodeActions('included', {
        marker: codeActions,
    });
}
