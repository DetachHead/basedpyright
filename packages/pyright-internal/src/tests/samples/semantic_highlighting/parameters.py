from typing import Any, Callable, Protocol

# Use a callable Protocol to test type-based semantic token fallback when there are
# no declarations
class Run(Protocol):
    def __call__(self, *, value: str, cb: Callable[[int], int], ty: type[int], **kwargs: Any) -> None: ...

def g(run: Run) -> None:
    run(value="a", cb=lambda i: i + 1, ty=int, any=1)
