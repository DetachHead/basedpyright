/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {}

// @filename: test.py
//// 1 + ""[|/*noExistingCommentMarker*/|]
//// 1 + ""[|/*existingCommentMarker1*/|] # pyright:ignore[reportOperatorIssue[|/*existingCommentMarker2*/|] ]
//// 1 + ""[|/*noExistingCommentAtEofMarker*/|]
{
    const noExistingCommentMarkerRange = helper.getPositionRange('noExistingCommentMarker');
    const existingCommentMarker2 = helper.getPositionRange('existingCommentMarker2');
    const noExistingCommentAtEofMarkerRange = helper.getPositionRange('noExistingCommentAtEofMarker');

    //@ts-expect-error https://github.com/DetachHead/basedpyright/issues/86
    await helper.verifyCodeActions('included', {
        noExistingCommentMarker: {
            codeActions: [
                {
                    title: 'Add `# pyright: ignore[reportOperatorIssue]`',
                    edit: {
                        changes: {
                            'file:///test.py': [
                                {
                                    range: noExistingCommentMarkerRange,
                                    newText: '  # pyright: ignore[reportOperatorIssue]',
                                },
                            ],
                        },
                    },
                    kind: 'quickfix',
                },
            ],
        },
        existingCommentMarker1: {
            codeActions: [
                {
                    title: 'Add `reportUnusedExpression` to existing `# pyright: ignore` comment',
                    edit: {
                        changes: {
                            'file:///test.py': [{ range: existingCommentMarker2, newText: ', reportUnusedExpression' }],
                        },
                    },
                    kind: 'quickfix',
                },
            ],
        },

        noExistingCommentAtEofMarker: {
            codeActions: [
                {
                    title: 'Add `# pyright: ignore[reportOperatorIssue]`',
                    edit: {
                        changes: {
                            'file:///test.py': [
                                {
                                    range: noExistingCommentAtEofMarkerRange,
                                    newText: '  # pyright: ignore[reportOperatorIssue]',
                                },
                            ],
                        },
                    },
                    kind: 'quickfix',
                },
            ],
        },
    });
}
