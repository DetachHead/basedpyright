from math import pi
from typing import Final, override

FOO = 1
foo: Final = 2
_ = 3
__: Final = 4


class Foo:
    def __init__(self):
        self.constant: Final = 42

    @property
    def foo(self) -> int: ...

    @property
    def bar(self) -> int: ...
    @bar.setter
    def bar(self, value: int): ...

    def __getattr__(self, name: str) -> float:
        return pi


class Bar:
    fir: Final[int] = 128

    def __getattr__(self, name: str) -> int:
        return int(name)

    @override
    def __setattr__(self, name: str, value: int):
        pass


Foo().foo
Foo().bar

baz = Foo()
_ = baz.foo
meaning = baz.constant
bam = baz.pi + Bar.fir
bar = Bar().beef
