/// <reference path="typings/fourslash.d.ts" />

// generic base -> finds the method in the generic class

// @filename: test.py
//// from typing import Generic, TypeVar
////
//// T = TypeVar("T")
//// class S15Base(Generic[T]):
////     def [|process|](self, value: T) -> T: ...
//// class S15Child(S15Base[int]):
////     def /*marker15*/process(self, value: int) -> int:
////         return value

{
    const rangeMap = helper.getRangesByText();

    const parentRanges = rangeMap
        .get('process')!
        .map((r) => ({ filePath: r.fileName, range: helper.convertPositionRange(r) }));

    helper.verifyShowTypeHierarchyGetSupertypes({ marker15: { items: parentRanges } });
}
