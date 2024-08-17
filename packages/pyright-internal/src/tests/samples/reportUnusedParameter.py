from abc import abstractmethod
from typing import override


def foo(value: int): ...

class Foo:
    @abstractmethod
    def foo(self, asdf: int): ...

    def bar(self, asdf: int): ...

class Bar(Foo):
    @override
    def foo(self, asdf: int): ...

    @override
    def bar(self, asdf: int): ...