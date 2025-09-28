from typing import ClassVar


class A:
    a: ClassVar


def takes_int(x: int): ...


# Using a bare ClassVar (implicitly Any) as an argument should trigger reportAny when enabled

takes_int(A.a)
