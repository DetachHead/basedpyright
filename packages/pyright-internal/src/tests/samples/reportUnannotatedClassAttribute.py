from typing import final, override


class A:
    value = 1


class C(A):
    value = None

@final
class D(C):
    value = 'sadf'


class E(A):
    @property
    @override
    def value(self) -> int: ...

class F(A):
    value: int = 1