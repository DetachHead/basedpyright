from typing import Any, Callable, Protocol

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

# Use a callable Protocol to test type-based semantic token fallback when there are
# no declarations
class Run(Protocol):
    def __call__(self, *, value: str, cb: Callable[[int], int], ty: type[int], **kwargs: Any) -> None: ...

def g(run: Run) -> None:
    run(value="a", cb=lambda i: i + 1, ty=int, any=1)
