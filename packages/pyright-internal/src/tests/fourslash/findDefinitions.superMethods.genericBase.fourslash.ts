/// <reference path="typings/fourslash.d.ts" />

// generic base -> finds the method in the generic class

// @filename: test.py
//// from typing import Generic, TypeVar
////
//// T = TypeVar("T")
//// class S15Base(Generic[T]):
////     def [|process|](self, value: T) -> T: ...
//// class S15Child(S15Base[int]):
////     def /*marker15*/[|process|](self, value: int) -> int:
////         return value

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker15: expected('process') }, 'all');
}
