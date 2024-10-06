from typing import Never, assert_type, Iterable


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