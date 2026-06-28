/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class S1A:
////     def [|m1|](self) -> None:
////         pass
//// class S1B(S1A):
////     def /*marker1*/m1(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m1')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker1: { items: parentRanges } });
}
