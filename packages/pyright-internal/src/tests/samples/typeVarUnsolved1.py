# this sample tests the detection of unsolved type variables in function calls

from typing import Any, Callable

def func1[T]() -> T: ...


def func2[T](x: T) -> T:
    return x


def func3[T, U](x: T) -> U: ...


def func4[T = int]() -> T: ...


def func5[T, U = str](x: T) -> U: ...


# Error: T cannot be inferred
a = func1()

# OK: T is inferred from argument
b = func2(1)

# Error: U cannot be inferred (T is fine)
c = func3(1)  # pyright: ignore[reportUnsolvedTypeVar]

# OK: T has a default value
d = func4()

# OK: T is inferred, U has a default value
e = func5(1)


# test with explicit type arguments
f: int = func1()

class MyClass[T]: ...

# ok: T is explicit
i = MyClass[int]()

# error: can't infer class type from constructor
i = MyClass()  # pyright: ignore[reportUnsolvedTypeVar]

class Default[T=Any]: ...

# ok: T is explicit
i = Default[int]()

# ok: uses default
i = Default()

def deco[T]() -> Callable[[Callable[[], T]], Callable[[], T]]: ...

# ok: T is None
@deco()
def func6():
    pass

deco()(lambda: None)

# OK: T is inferred from argument
j: int = func2(func1())

# error
k = []

# no error
l: list[int] = []
