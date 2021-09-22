# This sample tests the handling of a __getattr__ method that returns
# a callable. Such a method should not be bound.

from typing import Callable, Literal, TypeVar


class ClassA:
    def __init__(self):
        return

    def __getattr__(self, key: str) -> Callable[[str], str]:
        return lambda a: a


a = ClassA()

a.foo("hi")


T = TypeVar("T")


class MetaClass(type):
    def __getattr__(cls, key: str) -> Callable[[T], T]:
        return lambda x: x


class ClassB(metaclass=MetaClass):
    pass


v1 = ClassB.some_function(3)
t_v1: Literal["int"] = reveal_type(v1)

v2 = ClassB.some_function("hi")
t_v2: Literal["str"] = reveal_type(v2)
