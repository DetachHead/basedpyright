from typing import override


class Foo:
    @property
    def deps(self) -> int: ...

class Bar(Foo): 
    deps = '' # reportIncompatibleMethodOverride & reportAssignmentType
              

class Baz:
    a: int | None = None

  
class Qux(Baz):
    a = 1 # reportIncompatibleUnannotatedOverride

class A:
    @property
    def foo(Self) -> int: ...

class B(A):
    @property
    @override
    def foo(Self) -> str: ... # reportIncompatibleMethodOverride