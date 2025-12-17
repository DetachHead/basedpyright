/// <reference path="typings/fourslash.d.ts" />

// @filename: class_test.py
//// class A:
////     pass
////
//// class [|/*marker*/B|](A):
////     pass
////
//// class [|C|](B):
////     pass

{
    const ranges = helper.getRanges();

    helper.verifyFindAllImplementations({
        marker: {
            implementations: ranges.map((r) => {
                return { path: r.fileName, range: helper.convertPositionRange(r) };
            }),
        },
    });
}
