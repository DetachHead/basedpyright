/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// [|/*marker*/foo|] = 1
//// foo

{
    helper.verifyRename(
        {
            marker: {
                newName: 'foo bar',
                changes: [],
            },
        },

        false,
        { warning: ['Can only rename to a valid Python identitifer, got: "foo bar"'] }
    );
}
