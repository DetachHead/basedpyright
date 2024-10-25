from typing import ClassVar, Final


foo: Final = int()
bar: str = ""
baz: Final[str] = ""

class Foo:
    a: ClassVar = "asdf"
    b: ClassVar[str] = "asdf"