/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "autoImportCompletions": false
////   "typeCheckingMode": "recommended"
//// }

// @filename: test.py
//// [|/*import*/|]class Base:
////     def method(self) -> None: ...
////
//// class Derived(Base):
////     [|/*override*/|]def method(self) -> None: ...

{
    const importRange = helper.getPositionRange('import');
    const overrideRange = helper.getPositionRange('override');

    const codeActionTitle = 'Add `@override`';

    const codeActions = {
        codeActions: [
            {
                title: codeActionTitle,
                edit: {
                    changes: {
                        'file:///test.py': [
                            // Assumes method is indented with 4 spaces. Adjust if necessary.
                            { range: overrideRange, newText: '@override\n    ' },
                            { range: importRange, newText: 'from typing import override\n\n\n' },
                        ],
                    },
                },
                kind: 'quickfix',
            },
        ],
    };

    //@ts-expect-error https://github.com/DetachHead/basedpyright/issues/86
    await helper.verifyCodeActions('included', {
        noImportMarker: { codeActions: [] },
        startMarker: codeActions,
        endMarker: codeActions,
    });
}
