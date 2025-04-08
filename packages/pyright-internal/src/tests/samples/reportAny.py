from typing import Any, Callable, cast
from dataclasses import dataclass, field

def foo(bar: Any) -> Any:
    print(bar)
    return bar

bar: Any = object() # no error, but error on usage and with reportExplicitAny

@bar
class Bar(bar): ...

@bar
def baz() -> None: ...

qux: Callable[[], Any] = lambda: bar

match(bar):
    case _:
        ...

cast(int, bar)
cast(int, bar.asdf)

asdf: int = foo(1) # error because foo returns Any, must be explicitly casted
asdf2: int = cast(int, foo(1)) # no error

@dataclass
class Foo:
    a: int = field() # no error even tho field returns Any