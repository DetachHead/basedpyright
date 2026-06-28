/// <reference path="typings/fourslash.d.ts" />

// multiple inheritance: D(B, C), both bases define the method -> all three returned

// @filename: test.py
//// class S4B:
////     def [|m4|](self) -> None:
////         pass
//// class S4C:
////     def [|m4|](self) -> None:
////         pass
//// class S4D(S4B, S4C):
////     def /*marker4*/[|m4|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker4: expected('m4') }, 'all');
}
