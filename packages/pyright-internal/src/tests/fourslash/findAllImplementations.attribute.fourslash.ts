/// <reference path="typings/fourslash.d.ts" />

// @filename: class_test.py
//// class A:
////     x: int = 2
////
//// class B(A):
////     [|x|]: int
////
////     def __init__(self) -> None:
////         self.[|x|] = 3
////
////     def foo(self) -> None:
////         print(self.x)
////
//// class C(B):
////     def __init__(self) -> None:
////         self.[|x|] = 4
////
//// class F(A):
////     x: int
////
//// b = B()
//// print(b.[|/*marker*/x|])

{
    const ranges = helper.getRanges().filter((r) => !r.marker);

    helper.verifyFindAllImplementations({
        marker: {
            implementations: ranges.map((r) => {
                return { path: r.fileName, range: helper.convertPositionRange(r) };
            }),
        },
    });
}
