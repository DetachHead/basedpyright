/// <reference path="typings/fourslash.d.ts" />

// @filename: test.py
//// class Foo:
////     def [|/*fooInit*/__init__|](self):
////         pass
////     def [|/*fooCall*/__call__|](self, a: int) -> int:
////         return a
//// [|/*fooVar*/foo|] = Foo([|/*marker1a*/|])
//// [|/*marker2a*/foo|](1)[|/*marker2b*/|]

{
    const namedRanges = new Map(
        helper
            .getRanges()
            .filter((range) => range.marker)
            .map((range) => [helper.getMarkerName(range.marker!), range])
    );

    const rangeToDoc = (r: _.Range): _.DocumentRange => {
        return { path: r.fileName, range: helper.convertPositionRange(r) };
    };
    const nameToDoc = (name: string): _.DocumentRange => {
        return rangeToDoc(namedRanges.get(name)!);
    };

    helper.verifyFindDefinitions({
        marker1a: { definitions: [nameToDoc('fooInit')] },
        marker2a: { definitions: [nameToDoc('fooVar')] },
        marker2b: { definitions: [nameToDoc('fooCall')] },
    });
}
