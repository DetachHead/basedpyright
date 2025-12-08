from typing import overload

def foo(
    height: int,
    width: int,
): ...


height = 1
length = 2

foo(
    height,  # okay, name matches parameter name
    length,  # pyright: ignore[reportPositionalArgumentNameMismatch]
)

foo(
    height=height,  # okay, using keyword
    width=length,  # okay, using keyword
)

foo(
    height,  # okay, matches
    width=length,  # okay, using keyword
)

def bar(a: int, /, b: int): ...

bar(
    1,
    2,
)

bar(
    1,
    b=2,  # pyright: ignore[reportPositionalArgumentNameMismatch]
)

len([])

@overload
def f(a: int, b: int): ...
@overload
def f(a: str, b: str): ...

def f(a, b): ...

f(
    1,  # pyright: ignore[reportPositionalArgumentNameMismatch]
    2,  # pyright: ignore[reportPositionalArgumentNameMismatch]
)
