/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class [|Base1|]:
////     pass
//// class [|Base2|]:
////     pass
//// class /*marker1*/Child(Base1, Base2):
////     pass

{
    const rangeMap = helper.getRangesByText();

    const base1Ranges = rangeMap
        .get('Base1')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));
    const base2Ranges = rangeMap
        .get('Base2')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker1: { items: [...base1Ranges, ...base2Ranges] } });
}
