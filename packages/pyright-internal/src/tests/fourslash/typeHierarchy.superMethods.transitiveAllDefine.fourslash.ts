/// <reference path="typings/fourslash.d.ts" />

// all three classes define the method -> only the direct parent (first in MRO)

// @filename: test.py
//// class S3A:
////     def m3(self) -> None:
////         pass
//// class S3B(S3A):
////     def [|m3|](self) -> None:
////         pass
//// class S3C(S3B):
////     def /*marker3*/m3(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m3')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker3: { items: parentRanges } });
}
