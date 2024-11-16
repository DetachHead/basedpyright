from enum import Enum
from typing import Final, final, override


class A:
    value = 1 # error


class C(A):
    value = None  # error
    final_variable: Final = 1  # no error because final

@final
class D(C):
    value = 'sadf'  # no error because final


class E(A):
    @property
    @override
    def value(self) -> int: ...  # no error because property

class F(A):
    value: int = 1  # no error because annotated

class G:
    a: int = 1
    def __init__(self) -> None:
        self.a = 1 # no error because it has a typed declatation elsewhere

class H(Enum):
    a = 1

class I:
    __slots__: tuple[str,...] = ("asdf",)  # no error on this declaration because you can't put a type annotation here

    def __init__(self) -> None:
        self.asdf = 1 # error
