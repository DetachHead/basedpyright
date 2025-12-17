/// <reference path="typings/fourslash.d.ts" />

// @filename: library/__init__.py
//// # empty

// @filename: library/proto.py
//// from typing import Protocol
////
//// class SupportsFoo(Protocol):
////     def [|foo|](self) -> None: ...

// @filename: library/classes.py
//// class C:
////     def [|foo|](self, x: int = 3) -> None:
////         pass
////
//// class DifferentFoo:
////     def foo(self, x: int) -> None:
////         pass

// @filename: library/functions.py
//// from .proto import SupportsFoo
////
//// def use_foo(bar: SupportsFoo) -> None:
////     bar.[|/*marker*/foo|]()

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
