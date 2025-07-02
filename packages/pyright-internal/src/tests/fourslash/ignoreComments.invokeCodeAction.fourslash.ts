/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {}

// @filename: test.py
//// 1 + ""[|/*marker1*/|]
//// 1 + ""[|/*marker2*/|] # pyright:ignore[reportOperatorIssue[|/*marker3*/|] ]
{
    const marker1Range = helper.getPositionRange('marker1');
    const marker3Range = helper.getPositionRange('marker3');

    //@ts-expect-error https://github.com/DetachHead/basedpyright/issues/86
    await helper.verifyCodeActions('included', {
        marker1: {
            codeActions: [
                {
                    title: 'Add `# pyright: ignore[reportOperatorIssue]`',
                    edit: {
                        changes: {
                            'file:///test.py': [
                                { range: marker1Range, newText: '  # pyright: ignore[reportOperatorIssue]' },
                            ],
                        },
                    },
                    kind: 'quickfix',
                },
            ],
        },
        marker2: {
            codeActions: [
                {
                    title: 'Add `reportUnusedExpression` to existing `# pyright: ignore` comment',
                    edit: {
                        changes: {
                            'file:///test.py': [{ range: marker3Range, newText: ', reportUnusedExpression' }],
                        },
                    },
                    kind: 'quickfix',
                },
            ],
        },
    });
}
