/// <reference path="typings/fourslash.d.ts" />

// parent is a Protocol -> returns the method decl in the Protocol

// @filename: test.py
//// from typing import Protocol
////
//// class S13Proto(Protocol):
////     def [|m13|](self) -> int: ...
//// class S13Impl(S13Proto):
////     def /*marker13*/m13(self) -> int:
////         return 0

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m13')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker13: { items: parentRanges } });
}
