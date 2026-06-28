/// <reference path="typings/fourslash.d.ts" />

// cursor inside method body -> normal definition, no base injection

// @filename: test.py
//// class S7A:
////     def m7(self) -> None:
////         pass
//// class S7B(S7A):
////     def m7(self) -> None:
////         [|local7|] = 1
////         return /*marker7*/local7

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker7: expected('local7') }, 'all');
}
