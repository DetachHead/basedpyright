/// <reference path="typings/fourslash.d.ts" />

// multiple inheritance: D(B, C), only one base defines the method -> child + that base

// @filename: test.py
//// class S5B:
////     pass
//// class S5C:
////     def [|m5|](self) -> None:
////         pass
//// class S5D(S5B, S5C):
////     def /*marker5*/[|m5|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker5: expected('m5') }, 'all');
}
