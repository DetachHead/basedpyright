/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class /*marker1*/Base:
////     pass
//// class [|Child|](Base):
////     pass

{
    const rangeMap = helper.getRangesByText();

    const childRanges = rangeMap
        .get('Child')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSubtypes({ marker1: { items: childRanges } });
}
