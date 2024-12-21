import contextlib
from typing import Literal

def _(cm: contextlib.AbstractContextManager[object, Literal[True]]):
    with cm:
        raise Exception   
    print(1)  # reachable
 
def _(cm: contextlib.AbstractContextManager[object, Literal[False]]):
    with cm:
        raise Exception
    print(1)  # error: unreachable
