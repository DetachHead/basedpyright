from typing import Literal, cast, override
from abc import ABC, abstractmethod


class Foo:
    @property
    def deps(self) -> int: ...

class Bar(Foo): 
    deps = '' # reportIncompatibleMethodOverride & reportAssignmentType
              

class Baz:
    a: int | None = None

  
class Qux(Baz):
    a = 1

class A:
    @property
    def foo(Self) -> int: ...

class B(A):
    @property
    @override
    def foo(Self) -> str: ... # reportIncompatibleMethodOverride


class C:
    a = 1

class D(C):
    a: Literal[1] = 1 # reportIncompatibleUnannotatedOverride (because invariant)

class E(C):
    a = "" # reportIncompatibleUnannotatedOverride

class F:
    a: str | None = ""


class G(F):
    a = cast(str | None, "")


class H(G): 
    a = ""

class I(ABC):
    @property
    @abstractmethod
    def foo(self) -> int: ...

class J(I):
    foo = 1  # reportIncompatibleMethodOverride & reportAssignmentType


class K(J):
    foo = 2
