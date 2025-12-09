from typing import Any, Callable


class A:
    def __init__(self):
        self._prop = "yes"

    @property
    def prop(self):
        return self._prop

    @prop.setter
    def prop(self, value):
        self._prop = value


a = A()
ap = a.prop
a.prop = "hi"

test_any = Any
foo: test_any = 1
test: Any = s
not_a_type = test

b: Callable[[], None] | int = 2
c: Callable[[], None] | Callable[[int], None]
d: Callable[[], None] | type[int]
e: type[int] | type[float]
