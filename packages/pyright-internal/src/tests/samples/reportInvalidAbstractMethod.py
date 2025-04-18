from abc import ABC, abstractmethod
from typing import Protocol


class A:
    @abstractmethod
    def foo(self): ... # error


class B(A):
    @abstractmethod
    def asdf(self): ... # error


class C(ABC):
    @abstractmethod
    def foo(self): ...


class D(ABC):
    @abstractmethod
    def foo(self): ...


class E(Protocol):
    @abstractmethod
    def foo(self): ... # error (Protocols are a completely different concept to abstract classes, despite what the implementation of them will have you believe)