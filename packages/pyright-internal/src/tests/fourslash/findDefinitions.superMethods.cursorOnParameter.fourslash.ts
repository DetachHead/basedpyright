/// <reference path="typings/fourslash.d.ts" />

// cursor on a parameter in the def signature -> no base injection

// @filename: test.py
//// class S9A:
////     def m9(self) -> None:
////         pass
//// class S9B(S9A):
////     def m9(self, /*marker9*/[|p9: int|]) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker9: expected('p9: int') }, 'all');
}
