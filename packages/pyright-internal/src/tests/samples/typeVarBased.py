def f[T]() -> T: ... # error
def f1[T]() -> 'T': ... # error
def f2[T](v: T): ... # error
def f3[T]() -> list[T]: ...

class Foo[T]:
    def f(self) -> T: ...