from abc import ABC, abstractmethod, ABCMeta
from typing import Protocol, override

class A(ABC): 
    @abstractmethod
    def asdf(self) -> int: ...

class B(A): # error
    pass

class C(A, metaclass=ABCMeta): 
    pass

class D(A, ABC):
    pass

class E(A):
    @override
    def asdf(self) -> int:
        ...

class F(Protocol):
    @abstractmethod
    def asdf(self) -> int: ...

class G(F): # error
    pass

class H(F, Protocol):
    pass