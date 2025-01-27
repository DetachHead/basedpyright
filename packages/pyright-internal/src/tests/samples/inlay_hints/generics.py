from typing import ClassVar, Final, Unpack, override


foo: Final = int()
bar: str = ""
baz: Final[str] = ""

class Foo:
    a: ClassVar = "asdf"
    b: ClassVar[str] = "asdf"

_ = list([1])

class Bar[T]:
    def __init__(self, value: T) -> None:
        self.value = value

    def foo(self) -> None: ...

_ = Bar(True)

_ = tuple((1,2,3))

class Baz[U, *T]:
    def __init__(self, asdf: U,*value: Unpack[T]) -> None:
        pass

_ = Baz([1], 1,2,"")

class Qux(Bar[int]):
    @override
    def foo(self) -> None:
        return super().foo()

qux: list[tuple[int, str]] = list()

class Quxx:
    def __init__(self, value) -> None: ...


_ = Quxx(value=1)