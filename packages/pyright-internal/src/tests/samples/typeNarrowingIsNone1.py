# This sample tests the type analyzer's type narrowing logic for
# conditions of the form "X is None", "X is not None",
# "X == None" and "X != None".

# pyright: strict, reportUnusedVariable=false

from typing import Literal, Optional, TypeVar


def func1(x: Optional[int]):
    if x is not None:
        x.bit_length()

    if x != None:
        x.bit_length()

    if x is None:
        pass
    else:
        x.bit_length()

    if x == None:
        pass
    else:
        x.bit_length()


_T1 = TypeVar("_T1", None, str)


def func2(val: _T1) -> _T1:
    if val is not None:
        t1: Literal["str*"] = reveal_type(val)
        return val
    else:
        t2: Literal["None*"] = reveal_type(val)
        return val


def func3(x: object):
    if x is None:
        t1: Literal["None"] = reveal_type(x)
    else:
        t2: Literal["object"] = reveal_type(x)


_T2 = TypeVar("_T2")


def func4(x: _T2) -> _T2:
    if x is None:
        t1: Literal["None*"] = reveal_type(x)
        raise ValueError()
    else:
        t2: Literal["_T2@func4"] = reveal_type(x)
        return x
