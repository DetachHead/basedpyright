# this sample tests the type analyzer's ability to flag attempts
# to instantiate abstract base classes that have no abstract methods

from abc import ABC, ABCMeta


class AbstractFoo(ABC):
    """an abstract class with no abstract methods"""

class Foo(AbstractFoo):
    """a concrete subclass"""

# this should generate an error because `AbstractFoo`
# is an abstract class even though it has no abstract methods
a = AbstractFoo()  # pyright: ignore[reportAbstractUsage]

# this should not generate an error because Foo is concrete
b = Foo()


class NotAbstract:
    """a regular class that doesn't derive from ABC"""

# This should not generate an error because NotAbstract is not abstract
e = NotAbstract()


class IndirectlyAbstract(AbstractFoo):
    """inherits from an abstract class but doesn't override anything"""


# this should not generate an error because IndirectlyAbstract
# doesn't directly inherit from ABC (only through AbstractFoo)
f = IndirectlyAbstract()


class ConcreteClass(AbstractFoo):
    """a concrete class that properly inherits from AbstractFoo"""


# This should not generate an error
g = ConcreteClass()


class AbstractWithMethods(ABC):
    """abstract class with no abstract methods but regular methods"""

    def regular_method(self):
        return 1

    @classmethod
    def class_method(cls):
        return 2

    @staticmethod
    def static_method():
        return 3


# This should generate an error even though all methods are concrete
h = AbstractWithMethods()  # pyright: ignore[reportAbstractUsage]


class AbstractWithMetaclass(metaclass=ABCMeta):
    """abstract class using ABCMeta metaclass with no abstract methods"""

class ConcreteWithMetaclass(AbstractWithMetaclass):
    """concrete subclass of AbstractWithMetaclass"""


# this should generate an error because AbstractWithMetaclass uses ABCMeta
i = AbstractWithMetaclass()  # pyright: ignore[reportAbstractUsage]

# this should not generate an error
j = ConcreteWithMetaclass()
