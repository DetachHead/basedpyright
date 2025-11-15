/// <reference path="typings/fourslash.d.ts" />

// @filename: library/__init__.py
//// # empty

// @filename: library/base.py
//// from abc import ABC, abstractmethod
////
//// class FooBase(ABC):
////     @abstractmethod
////     def [|/*marker*/foo|](self) -> None: ...

// @filename: library/classes.py
//// from .base import FooBase
//// from typing import override
////
//// class C(FooBase):
////     def [|foo|](self) -> None:
////         pass
////
//// class D:
////     @override  # just to try to fool it
////     def foo(self) -> None:
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
