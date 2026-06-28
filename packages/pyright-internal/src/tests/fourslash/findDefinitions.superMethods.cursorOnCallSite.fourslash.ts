/// <reference path="typings/fourslash.d.ts" />

// cursor on a self.method() call site -> goes to base definition (no regression)

// @filename: test.py
//// class S8Base:
////     def [|m8|](self) -> None:
////         pass
//// class S8Child(S8Base):
////     def caller(self) -> None:
////         self./*marker8*/m8()

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions({ marker8: expected('m8') }, 'all');
}
