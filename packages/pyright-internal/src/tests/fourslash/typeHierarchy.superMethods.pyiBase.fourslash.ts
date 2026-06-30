/// <reference path="typings/fourslash.d.ts" />

// parent defined in a .pyi stub -> location points to the .pyi

// @filename: superlib/__init__.pyi
// @library: true
//// class LibBase:
////     def [|libm|](self) -> None: ...

// @filename: test.py
//// from superlib import LibBase
////
//// class S12Child(LibBase):
////     def /*marker12*/libm(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('libm')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker12: { items: parentRanges } });
}
