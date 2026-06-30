/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class /*marker1*/Base:
////     pass
//// class [|Child1|](Base):
////     pass
//// class [|Child2|](Base):
////     pass
//// class GrandChild(Child1):
////     pass

{
    const rangeMap = helper.getRangesByText();

    const child1Ranges = rangeMap
        .get('Child1')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));
    const child2Ranges = rangeMap
        .get('Child2')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSubtypes({ marker1: { items: [...child1Ranges, ...child2Ranges] } });
}
