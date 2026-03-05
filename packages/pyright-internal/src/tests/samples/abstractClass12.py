# this sample tests the type analyzer's ability to flag attempts
# to instantiate abstract base classes that have no abstract methods

from abc import ABC, ABCMeta


class ExplicitlyAbstract(ABC):
    """an abstract class with no abstract methods"""

# this should generate an error because it
# is an abstract class even though it has no abstract methods
a = ExplicitlyAbstract()

class NoLongerExplicitlyAbstract(ExplicitlyAbstract):
    """inherits from an explicitly abstract class"""


# this should not generate an error because NoLongerExplicitlyAbstract
# doesn't directly inherit from ABC
f = NoLongerExplicitlyAbstract()


class NotAbstract:
    """a regular class that doesn't derive from ABC"""

# This should not generate an error because NotAbstract is not abstract
e = NotAbstract()

class AbstractWithMetaclass(metaclass=ABCMeta):
    """abstract class using ABCMeta metaclass with no abstract methods"""

class ConcreteWithMetaclass(AbstractWithMetaclass):
    """concrete subclass of AbstractWithMetaclass"""


# this should generate an error because AbstractWithMetaclass uses ABCMeta
i = AbstractWithMetaclass()  # pyright: ignore[reportEmptyAbstractUsage]

# this should not generate an error
j = ConcreteWithMetaclass()
