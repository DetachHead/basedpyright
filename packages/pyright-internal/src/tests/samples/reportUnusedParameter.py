from abc import ABC, abstractmethod
from typing import override


def foo(value: int): ... # error

class Foo:
    @abstractmethod
    def foo(self, asdf: int): ...  # no error, abstract method

    def bar(self, asdf: int): ...  # error

class Bar(Foo):
    @override
    def foo(self, asdf: int): ...  # no error, override

    @override
    def bar(self, asdf: int): ...  # no error, override

    def __baz__(self, asdf: int):  # no error, dunder
        ...

    def qux(self, __asdf: int):  # error, unused cringe positional argument
        ...

def bar(_value: int): ...

class Baz(ABC):
    @property
    @abstractmethod
    def foo(self) -> str:...
    @foo.setter
    def foo(self, new_value: str):  # no error, abstract property
        ...