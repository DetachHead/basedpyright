from typing import Final

FOO = 1
foo: Final = 2
_ = 3
__: Final = 4

class Foo:
    @property
    def foo(self) -> int: ...

    @property
    def bar(self) -> int: ...
    @foo.setter
    def bar(self, value: int): ...


Foo().foo
Foo().bar