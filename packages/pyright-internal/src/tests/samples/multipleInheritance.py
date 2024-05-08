from dataclasses import dataclass

class A:
    ...
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
class I(B, A): ... # no error

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