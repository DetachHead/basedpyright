/// <reference path="typings/fourslash.d.ts" />

// multiple inheritance: D(B, C), only C defines the method -> MRO finds C.m5

// @filename: test.py
//// class S5B:
////     pass
//// class S5C:
////     def [|m5|](self) -> None:
////         pass
//// class S5D(S5B, S5C):
////     def /*marker5*/m5(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m5')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker5: { items: parentRanges } });
}
