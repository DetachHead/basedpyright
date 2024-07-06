from typing import NamedTuple

class Foo(NamedTuple):
    a: int # no error

class Bar:
    b: str # error
