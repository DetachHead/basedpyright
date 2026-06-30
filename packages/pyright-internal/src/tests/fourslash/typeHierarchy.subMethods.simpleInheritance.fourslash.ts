/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class Base:
////     def /*marker1*/m1(self) -> None:
////         pass
//// class Child(Base):
////     def [|m1|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const childRanges = rangeMap
        .get('m1')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSubtypes({ marker1: { items: childRanges } });
}
