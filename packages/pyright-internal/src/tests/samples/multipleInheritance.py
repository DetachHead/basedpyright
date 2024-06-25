from dataclasses import dataclass
from typing import TypedDict

class A:
    def __init__(self) -> None:
        pass
class B:
    def __init__(self) -> None:
        pass

class C:
    ...

class E(B):
    ...

class F(A, B): ... # error
class G(A, E): ... # error
class H(A, C): ... # no error
class I(B, C): ... # no error

@dataclass
class J:
    ...

@dataclass
class K:
    ...

@dataclass
class L:
    def __init__(self) -> None:
        pass

class M(J, K): ... # no error
class N(J, L): ... # error

class O(TypedDict):
    ...

class P(TypedDict):
    ...

class Q(O, P): ... # no error

class R:
    ...
class S:
    def __init__(self, a: int):
        super().__init__()
class T(R, S): # no error
    pass

@dataclass
class U(A, C): # error
    ...

@dataclass(init=False)
class V(A, C): # no error
    ...