/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// [|/*marker*/foo|] = 1
//// foo

{
    helper.verifyRename(
        {
            marker: {
                newName: 'def',
                changes: [],
            },
        },
        false,
        { warning: [`Cannot rename to "def": it's a Python keyword`] }
    );
}
