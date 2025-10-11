from dataclasses import dataclass
from collections.abc import Callable
from typing import dataclass_transform


@dataclass_transform(skip_replace=False, frozen_default=True)
def default_behavior[T: type](*, init: bool = True) -> Callable[[T], T]:
    return dataclass(frozen=True, slots=True, init=init)  # pyright: ignore[reportUnknownVariableType]


@dataclass_transform(skip_replace=True, frozen_default=True)
def skip_replace[T: type](*, init: bool = True) -> Callable[[T], T]:
    return dataclass(frozen=True, slots=True, init=init)  # pyright: ignore[reportUnknownVariableType]


# default behavior, with init=True
@default_behavior()
class A:
    x: int
    y: str

def test_a() -> None:
    a = A(1, "x")
    _a1: A = a.__replace__()
    _a2: A = a.__replace__(x=2)
    _a3: A = a.__replace__(y="b")
    _a4: A = a.__replace__(x=2, y="b")

    a.__replace__(z="wrong")  # should fail


# default behavior, with init=False
@default_behavior(init=False)
class B:
    x: int
    y: str

def test_b() -> None:
    b = B()
    b.__replace__  # should fail


# "always skip __replace__" behavior, with init=True
@skip_replace()
class C:
    x: int
    y: str

def test_c() -> None:
    c = C(1, "x")
    c.__replace__  # should fail


# "always skip __replace__" behavior, with init=False
@skip_replace(init=False)
class D:
    x: int
    y: str


def test_d() -> None:
    d = D()
    d.__replace__  # should fail


# frozen dataclass without replace should be covariant
@skip_replace()
class Box[T]:
    label: str
    value: T


def test_box_covariant(box: Box[int]) -> None:
    _0: Box[int | str] = box  # ok: covariant
    _1: Box[bool] = box  # should fail: not contravariant
