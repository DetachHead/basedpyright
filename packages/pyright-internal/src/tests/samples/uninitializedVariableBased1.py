from typing import final

# The objective of this test is to try a bunch of ways
# to trick the checker into thinking C.x is initialized
# when it's not initialized.


class C:
    x: int  # should be reported as uninitialized

    def __init__(self) -> None:
        self.a_method_called_by_init()

        def foo() -> None:  # pyright: ignore[reportUnusedFunction]
            self.x = 3

    def a_method_not_called_by_init(self) -> None:
        self.x = 3

    def a_method_called_by_init(self) -> None:
        # reference x before initializing it
        self.x += 3


def __init__() -> None:
    c = C()
    c.x = 3


class D:
    def __init__(self) -> None:
        c = C()
        c.x = 3


@final
class E(C):
    def __init__(self) -> None:
        super().__init__()
        self.x = 3


class F(C):
    def __init__(self) -> None:
        super().__init__()
        self.x = 3  # pyright: ignore[reportUnannotatedClassAttribute]
