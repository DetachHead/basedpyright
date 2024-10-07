from typing import Any, Never, assert_type, Iterable


class Covariant[T]:
    def foo(self, other: object): 
        if isinstance(other, Covariant):  
            assert_type(other, Covariant[object])

    def bar(self) -> T: ...

class CovariantByDefault[T]:
    """by default if there are no usages of a type var on a class, it's treated as covariant.
    imo this should be an error. see https://github.com/DetachHead/basedpyright/issues/744"""
    def foo(self, other: object): 
        if isinstance(other, CovariantByDefault):  
            assert_type(other, CovariantByDefault[object])

class CovariantWithBound[T: int | str]:
    def foo(self, other: object): 
        if isinstance(other, CovariantWithBound):  
            assert_type(other, CovariantWithBound[int | str])

    def bar(self) -> T: ...

class Contravariant[T]:
    def foo(self, other: object): 
        if isinstance(other, Contravariant):  
            assert_type(other, Contravariant[Never])

    def bar(self, other: T): ...

class ContravariantWithBound[T: int | str]:
    def foo(self, other: object): 
        if isinstance(other, ContravariantWithBound):  
            assert_type(other, ContravariantWithBound[Never])

    def bar(self, other: T): ...


def foo(value: object):
    match value:
        case Iterable():
            assert_type(value, Iterable[object])

class AnyOrUnknown:
    """for backwards compatibility with badly typed code we keep the old functionality when narrowing `Any`/Unknown"""
    def __init__(self, value):
        """arguments in `__init__` get turned into fake type vars if they're untyped, so we need to handle this case.
        see https://github.com/DetachHead/basedpyright/issues/746"""
        if isinstance(value, Iterable):
            assert_type(value, Iterable[Any])

    def any(self, value: Any):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[Any])

    def match_case(self, value: Any):
        match value:
            case Iterable():
                assert_type(value, Iterable[Any])

    def unknown(self, value):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[Any])

    def partially_unknown(self, value=None):
        if isinstance(value, Iterable):
            assert_type(value, Iterable[Any])
