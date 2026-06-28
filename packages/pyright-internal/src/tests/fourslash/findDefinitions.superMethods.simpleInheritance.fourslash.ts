/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class S1A:
////     def [|m1|](self) -> None:
////         pass
//// class S1B(S1A):
////     def /*marker1*/[|m1|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker1: expected('m1') }, 'all');
}
