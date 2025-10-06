from typing import Any, TypeAlias

def f(l: list) -> Any:
    v = l[0]
    return v


def f1(a):
    a = a.T.maximum()


def f2(b: Any) -> Any:
    return b.as_integer_ratio()


g(foo)
bar = f(...)

a, b = f2(12)
c = a.bit_length() + b.bit_length()

Foo = Any
Bar: TypeAlias = Any
type Baz = Any