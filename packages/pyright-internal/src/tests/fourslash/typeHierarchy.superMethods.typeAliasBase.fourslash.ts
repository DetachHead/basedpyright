/// <reference path="typings/fourslash.d.ts" />

// base via TypeAlias -> finds the method in the aliased class

// @filename: test.py
//// from typing import TypeAlias
////
//// class S14Base:
////     def [|m14|](self) -> None:
////         pass
//// S14Alias: TypeAlias = S14Base
//// class S14Child(S14Alias):
////     def /*marker14*/m14(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('m14')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker14: { items: parentRanges } });
}
