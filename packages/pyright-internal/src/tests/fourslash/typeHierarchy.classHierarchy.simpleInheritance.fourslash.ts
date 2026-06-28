/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class [|Base|]:
////     pass
//// class /*marker1*/Child(Base):
////     pass

{
    const rangeMap = helper.getRangesByText();

    const baseRanges = rangeMap
        .get('Base')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker1: { items: baseRanges } });
}
