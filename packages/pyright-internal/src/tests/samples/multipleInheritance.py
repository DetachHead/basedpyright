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