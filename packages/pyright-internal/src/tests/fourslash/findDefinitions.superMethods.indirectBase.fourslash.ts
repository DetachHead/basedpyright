/// <reference path="typings/fourslash.d.ts" />

// transitive, direct parent does NOT define the method -> only child decl returned

// @filename: test.py
//// class S2A:
////     def m2(self) -> None:
////         pass
//// class S2B(S2A):
////     pass
//// class S2C(S2B):
////     def /*marker2*/[|m2|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker2: expected('m2') }, 'all');
}
