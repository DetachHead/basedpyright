/// <reference path="typings/fourslash.d.ts" />

// free function sharing a name with a class method -> no base injection

// @filename: test.py
//// def /*marker10*/[|freefn|]() -> None:
////     pass
//// class S10Has:
////     def freefn(self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker10: expected('freefn') }, 'all');
}
