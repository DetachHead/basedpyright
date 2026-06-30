/// <reference path="typings/fourslash.d.ts" />

// multiple inheritance: D(B, C), both bases define the method -> MRO returns B.m4 first

// @filename: test.py
//// class S4B:
////     def [|m4|](self) -> None:
////         pass
//// class S4C:
////     def m4(self) -> None:
////         pass
//// class S4D(S4B, S4C):
////     def /*marker4*/m4(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m4')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker4: { items: parentRanges } });
}
