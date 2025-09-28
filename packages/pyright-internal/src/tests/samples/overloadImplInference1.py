# This sample tests inference of implementation types from overloads
# including generics, positional-only, keyword-only, varargs and kwargs.

from typing import Any, Tuple, Iterable, overload
from typing_extensions import assert_type  # pyright: ignore[reportMissingModuleSource]


# Basic: union inference for param and return with generic
@overload
def f(a: int) -> str: ...

@overload
def f[T](a: T) -> T: ...

def f[T](a):
    # Inferred parameter type should be int | T
    assert_type(a, int | T)
    # Return type should be str | T, so returning None should error
    return None  # pyright: ignore[reportReturnType]


# Positional-only with alpha-equivalence of type parameters
@overload
def po1[T](x: T, /) -> T: ...

@overload
def po1[U](x: U, y: U ,/) -> U: ...

def po1[V](x, y: V | None = None, /): # pyright: ignore[reportInvalidTypeVarUse] https://github.com/DetachHead/basedpyright/issues/1500
    # Both overloads are alpha-equivalent; inferred type should be V (not V | V)
    assert_type(x, V)
    return x

# TODO: impl does not have type parameters
# @overload
# def po2(x: int) -> int: ...
#
# @overload
# def po2[T](x: T) -> T: ...
#
# def po2(x, /):
#     reveal_type(x) # expect int | T
#     return x

# Positional-only union across concrete and generic
@overload
def g(x: int, /) -> int: ...

@overload
def g[T](x: T, /) -> T: ...

def g[T](x, /):
    assert_type(x, int | T)
    # Returning x should be OK because return type is int | T
    return x


# Keyword-only parameter
@overload
def h(*, x: int) -> str: ...

@overload
def h[T](*, x: T) -> T: ...

def h[T](*, x):
    assert_type(x, int | T)
    return ""


# Variadic positional parameters
@overload
def va1(*args: int) -> str: ...

@overload
def va1[T](*args: T) -> T: ...


def va1[T](*args):
    # Inferred "args" type should be tuple[T, ...] | tuple[int, ...]
    assert_type(args, tuple[T, ...] | tuple[int, ...])
    return ""


# Variadic keyword parameters
@overload
def kw2(**kwargs: int) -> str: ...

@overload
def kw2[T](**kwargs: T) -> T: ...

def kw2[T](**kwargs):
    # The variable inside body is a dict[str, <value type>]
    assert_type(kwargs, dict[str, T | int])
    return ""


@overload
def f2(i: int) -> int: ...
@overload
def f2(i: str, j: str) -> str: ...
def f2(i, j=None):
    assert_type(i, int | str)
    assert_type(j, str | None)
    return ""

@overload
def f3(i: int) -> int: ...
@overload
def f3(i: str, j: str) -> str: ...
def f3(i, j: str=None): # pyright: ignore[reportArgumentType, reportInconsistentOverload]
    assert_type(i, int | str)
    assert_type(j, str)
    return ""
