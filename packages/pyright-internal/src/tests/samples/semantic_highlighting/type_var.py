from typing import TypeVar


def foo[T](value: T):
    _bar: T = value


_T = TypeVar("_T")


def fooo(value: _T) -> _T:
    _bar: _T = value
    return _bar
