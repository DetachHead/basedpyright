from dataclasses import dataclass, field, replace
from typing import Callable, Protocol


class C:
    def __init__(self, x):
        self.x = x

    @classmethod
    def m(cls):
        return cls(1)

def f(x, y: int):
    def g(x):
        return x * y
    z = 2 + x
    return g(z)

lambda a, b: a + b


@dataclass(kw_only=True)
class Conf:
    size: int = 4
    dims: list[int] = field(default_factory=lambda: [8, 8, 4])


class Run(Protocol):
    def __call__(self, *, value: str, cb: Callable[[int], int], ty: type[int]) -> None: ...


def g(run: Run) -> None:
    run(value="a", cb=lambda i: i + 1, ty=int)


def h(conf: Conf, size: int) -> Conf:
    return replace(conf, size=size)
