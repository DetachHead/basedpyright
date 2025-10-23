from dataclasses import dataclass
from typing import assert_type, dataclass_transform


@dataclass_transform()
def foo(cls: type[object]) -> object:
    return dataclass(cls)


@foo
class Foo:
    a: int


_ = assert_type(Foo, type[Foo])
asdf = Foo(a=1)