/// <reference path="typings/fourslash.d.ts" />

// parent is a Protocol -> returns the method decl in the Protocol

// @filename: test.py
//// from typing import Protocol
////
//// class S13Proto(Protocol):
////     def [|m13|](self) -> int: ...
//// class S13Impl(S13Proto):
////     def /*marker13*/[|m13|](self) -> int:
////         return 0

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker13: expected('m13') }, 'all');
}
