import os
from typing import Any, Callable, Final, TypeVar


class A:
    cvar: int = 3

    def __init__(self, f: Callable[[], int], t: type[int]):
        self.f: Final[Callable[[], int]] = f
        self.t: type[int] = t

    @property
    def b(self) -> int:
        return self.f()

    @b.setter
    def b(self, value: int) -> None:
        pass

    @staticmethod
    def d(i: int) -> float:
        return i * 2.5

    def __getattr__(self, name: str) -> Callable[[], float]:
        return lambda: 3.14

def ufun0(a):
    a = a.T.maximum()


def ufun1(b: Any) -> Any:
    return b.as_integer_ratio()


a = A(lambda: int(A.d(3)), int)
print(a.b, a.f, os.path.pardir)
c = a.t
d: Any = a.abc()
A.cvar = 4 + d.is_integer()
e = ufun1(12)
