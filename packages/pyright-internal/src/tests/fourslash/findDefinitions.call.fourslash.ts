/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class Foo:
////     def [|/*fooInit*/__init__|](self):
////         pass
////     def [|/*fooCall*/__call__|](self, a: int) -> int:
////         return a
//// [|/*fooVar*/foo|] = Foo([|/*marker1a*/|])
//// [|/*marker2a*/foo|]([|/*marker2b*/1|])[|/*marker2c*/|]

{
    const docs = helper.markerDocumentRanges();

    helper.verifyFindDefinitions({
        marker1a: { definitions: [docs.get('fooInit')!] },
        marker2a: { definitions: [docs.get('fooVar')!] },
        marker2b: { definitions: [] },
        marker2c: { definitions: [docs.get('fooCall')!] },
    });
}
