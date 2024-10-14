from abc import ABC, abstractmethod, ABCMeta

class Foo(ABC): 
    @abstractmethod
    def asdf(self) -> int: ...

class Bar(Foo): # error
    pass

class Baz(Foo, metaclass=ABCMeta): 
    pass

class Qux(Foo, ABC):
    pass
