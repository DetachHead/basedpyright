from collections.abc import Callable
from typing import Protocol, assert_type, dataclass_transform
from dataclasses import dataclass


@dataclass_transform(kw_only_default=True)
def rescoped[T: type](*, frozen: bool = False) -> Callable[[T], T]:
    return dataclass(frozen=frozen)  # pyright: ignore[reportUnknownVariableType]

@rescoped()
class Foo:
    x: str
    y: int

FOO = Foo(x="a", y=42)  # works


class Decorator(Protocol):
    def __call__[T: type](self, t: T, /) -> T:
        ...

@dataclass_transform(kw_only_default=True)
def spec(*, frozen: bool = False) -> Decorator:
    return dataclass(frozen=frozen)  # pyright: ignore[reportUnknownVariableType]

@spec()
class Bar:
    x: str
    y: int

BAR = Bar(x="a", y=42)

_ = assert_type(BAR, Bar)