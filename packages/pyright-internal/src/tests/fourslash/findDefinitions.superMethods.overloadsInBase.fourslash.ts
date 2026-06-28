/// <reference path="typings/fourslash.d.ts" />

// overloads in the direct parent -> all overload decls included

// @filename: test.py
//// from typing import overload
////
//// class S11Base:
////     @overload
////     def [|m11|](self) -> None: ...
////     @overload
////     def [|m11|](self, a: int) -> None: ...
////     def [|m11|](self, a: int = 0) -> None:
////         pass
//// class S11Child(S11Base):
////     def /*marker11*/[|m11|](self, a: int = 0) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker11: expected('m11') }, 'all');
}
