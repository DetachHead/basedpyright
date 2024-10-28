from typing import ClassVar, Final


foo: Final = int()
bar: str = ""
baz: Final[str] = ""

class Foo:
    a: ClassVar = "asdf"
    b: ClassVar[str] = "asdf"

_ = list([1])

class Foo[T]:
    def __init__(self, value: T) -> None:
        self.value = value

_ = Foo("") 