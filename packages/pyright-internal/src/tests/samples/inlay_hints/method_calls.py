def bar(foo: int) -> None:
    pass

class Foo:
    foo: int

    def baz(self) -> None:
        bar(3)
        bar(self.foo)
        bar(baz.quz.qux.foo)