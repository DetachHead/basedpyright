/// <reference path="typings/fourslash.d.ts" />

// @filename: library/__init__.py
//// # empty

// @filename: library/proto.py
//// from typing import Protocol
////
//// class SupportsFoo(Protocol):
////     def [|/*marker*/foo|](self) -> None: ...

// @filename: library/classes.py
//// class C:
////     def [|foo|](self, x: int = 3) -> None:
////         pass
////
//// class DifferentFoo:
////     def foo(self, x: int) -> None:
////         pass

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
