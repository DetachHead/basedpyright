/// <reference path="typings/fourslash.d.ts" />

// cursor on a type in a variable annotation -> hierarchy rooted at the class definition

// @filename: test.py
//// class [|Base|]:
////     pass
//// class Child(Base):
////     pass
//// x: /*marker*/Child

{
    const rangeMap = helper.getRangesByText();

    const baseRanges = rangeMap
        .get('Base')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker: { items: baseRanges } });
}
