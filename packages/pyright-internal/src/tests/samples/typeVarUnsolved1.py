# this sample tests the detection of unsolved type variables in function calls

from typing import Callable

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
c = func3(1)

# OK: T has a default value
d = func4()

# OK: T is inferred, U has a default value
e = func5(1)


# test with explicit type arguments
f: int = func1()


# test class with unsolved type var
class MyClass[T]:
    @staticmethod
    def create() -> "MyClass[T]": ...

    @staticmethod
    def create_from(x: T) -> "MyClass[T]": ...


# this should produce an error, but there are some issues with this feature, see #1499
# Error: T cannot be inferred
g = MyClass.create()

# OK: T is inferred from argument
h = MyClass.create_from(42)

# ok: T is explicit
i = MyClass[int]()

def deco[T]() -> Callable[[Callable[[], T]], Callable[[], T]]: ...

# ok: T is None
@deco()
def func6():
    pass

deco()(lambda: None)

# OK: T is inferred from argument
j: int = func2(func1())

# error
k = []  # pyright: ignore[reportUnsolvedTypeVar]

# no error
l: list[int] = []
