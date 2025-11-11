from typing import Callable, Concatenate


class A[T, U]:
    def __init__(self, func: Callable[[T], U]) -> None: ...
    def __get__(self, instance: T, owner: type[T] | None = None) -> U: ...
    def __set__(self, instance: T, value: U) -> None: ...


class B[T, U](A[T, U]): ...


def deco[T, **P, R](
    fn: Callable[Concatenate[T, P], R],
) -> Callable[Concatenate[T, P], R]: ...


class Foo:
    @A
    def foo(self) -> int: ...

    @B
    def bar(self) -> int: ...

    @property
    def bat(self) -> int: ...
    @bat.setter
    def bat(self, value: int) -> None: ...

    @property
    def baz(self) -> int: ...

    @property
    @deco
    def cat(self) -> int: ...
    @cat.setter
    @deco
    def cat(self, value: int): ...


foo = Foo()

foo.foo
foo.bar
foo.bat
foo.bat = 3
foo.baz
foo.cat
foo.cat = 1
