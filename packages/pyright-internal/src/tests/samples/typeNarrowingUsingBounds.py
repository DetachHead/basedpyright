from typing import Any, Never, assert_type, runtime_checkable, Protocol, Iterable, Iterator, MutableMapping, Reversible, Callable, TypeIs
from types import FunctionType

class Covariant[T]:
    def foo(self, other: object):
        if isinstance(other, Covariant):
            assert_type(other, Covariant[object])

    def bar(self) -> T: ...


class InheritCovariant[T](Covariant[T]):
    def baz(self, other: Covariant[int]) -> None:
        if isinstance(other, InheritCovariant):
            assert_type(other, InheritCovariant[int])


class CovariantByDefault[T]:
    """by default if there are no usages of a type var on a class, it's treated as covariant.
    imo this should be an error. see https://github.com/DetachHead/basedpyright/issues/744"""
    def foo(self, other: object):
        if isinstance(other, CovariantByDefault):
            assert_type(other, CovariantByDefault[object])


class CovariantWithBound[T: int | str]:
    def foo(self, other: object):
        if isinstance(other, CovariantWithBound):
            assert_type(other, CovariantWithBound[int | str])

    def bar(self) -> T: ...


class Contravariant[T]:
    def foo(self, other: object):
        if isinstance(other, Contravariant):
            assert_type(other, Contravariant[Never])

    def bar(self, other: T): ...


class ContravariantWithBound[T: int | str]:
    def foo(self, other: object):
        if isinstance(other, ContravariantWithBound):
            assert_type(other, ContravariantWithBound[Never])

    def bar(self, other: T): ...


class Invariant[T]:
    """make sure invariant doesn't think it knows the type param - narrowing to invariant isn't safe """
    def foo(self, other: object):
        if isinstance(other, Invariant):
            assert_type(other, Invariant[Any])  # Unknown

    def bar(self, other: T) -> T: ...


class InvariantWithBound[T: float | bytes]:
    """make sure invariant doesn't think it knows the type param - narrowing to invariant isn't safe """
    def foo(self, other: object):
        if isinstance(other, Invariant):
            assert_type(other, Invariant[Any])  # Unknown

    def bar(self, other: T) -> T: ...


def foo(value: object):
    match value:
        case Iterable():
            assert_type(value, Iterable[object])


class AnyOrUnknown:
    def __init__(self, value):
        """arguments in `__init__` get turned into fake type vars if they're untyped, so we need to handle this case.
        see https://github.com/DetachHead/basedpyright/issues/746"""
        if isinstance(value, Iterable):
            assert_type(value, Iterable[object])

    def any(self, value: Any):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[object])

    def match_case(self, value: Any):
        match value:
            case Iterable():
                assert_type(value, Iterable[object])

    def unknown(self, value):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[object])

    def partially_unknown(self, value=None):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[object])


def goo[KT, VT](self: MutableMapping[KT, VT]) -> Iterator[KT]:
    assert isinstance(self, Reversible)
    return reversed(self)

class Constraints[T: (int, str), U: (int, str), V: int]:
    ...
 
def _(value: object):
    if isinstance(value, Constraints):
        assert_type(value, Constraints[int, int, int] | Constraints[int, str, int] | Constraints[str, int, int] | Constraints[str, str, int])

@runtime_checkable
class Foo[T: (int, str)](Protocol):
    def asdf(self): ...

def _(
    value: str | Foo[str],
):
    if isinstance(value, Foo):
        assert_type(value, Foo[str])

def _(f: Callable[[int], str]):
    if isinstance(f, staticmethod):
        # can't use assert_type on the function itself, see TODO in synthesizeCallableProtocolFromFunctionType
        assert_type(f(1), str)
        assert_type(f.__call__, Callable[[int], str])
        reveal_type(f)

class CallableProtocol[**P, T](Protocol):
    def __call__(self, *args: P.args, **kwargs: P.kwargs) -> T: ...


def _(f: CallableProtocol[[], None]):
    if isinstance(f, staticmethod):
        assert_type(f, staticmethod[[], None])

def _(f: Callable[[int], str]):
    if isinstance(f, FunctionType):
        assert_type(f, FunctionType)

def takes_arg(value: object) -> TypeIs[Callable[[int], None]]: ...

def _(value: Callable[[], None] | Callable[[int], None]):
    if takes_arg(value):
        assert_type(value, Callable[[int], None])

# test for an upstream bug that i accidentally fixed
# https://github.com/DetachHead/basedpyright/issues/452
class Bar:
    ...
class Baz(Bar):
    def __call__(self): ...
def _[T, **P](value: Callable[P, T]):
    if isinstance(value, Bar):
        reveal_type(value)