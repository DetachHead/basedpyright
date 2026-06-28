/// <reference path="typings/fourslash.d.ts" />

// transitive: direct parent does NOT define the method -> MRO finds the grandparent

// @filename: test.py
//// class S2A:
////     def [|m2|](self) -> None:
////         pass
//// class S2B(S2A):
////     pass
//// class S2C(S2B):
////     def /*marker2*/m2(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m2')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker2: { items: parentRanges } });
}
