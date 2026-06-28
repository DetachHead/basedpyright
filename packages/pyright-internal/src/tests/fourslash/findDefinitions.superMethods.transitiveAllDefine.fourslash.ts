/// <reference path="typings/fourslash.d.ts" />

// transitive, all three classes define the method -> only direct parent included (not grandparent)

// @filename: test.py
//// class S3A:
////     def m3(self) -> None:
////         pass
//// class S3B(S3A):
////     def [|m3|](self) -> None:
////         pass
//// class S3C(S3B):
////     def /*marker3*/[|m3|](self) -> None:
////         pass

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker3: expected('m3') }, 'all');
}
