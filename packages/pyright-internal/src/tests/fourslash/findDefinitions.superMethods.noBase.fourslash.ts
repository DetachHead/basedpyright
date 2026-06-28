/// <reference path="typings/fourslash.d.ts" />

// method not overridden -> only local decl returned (no regression)

// @filename: test.py
//// class S6Solo:
////     def /*marker6*/[|m6|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker6: expected('m6') }, 'all');
}
