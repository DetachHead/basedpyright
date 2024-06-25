from typing import Literal, assert_never

def foo(value: Literal[1]):
    if value == 1:
        ...
    else:
        assert_never(value) # not unreachable
        ... # unreachable
def bar(value: Literal[1]):
    if value == 1:
        ...
    else:
        assert_never('value') # unreachable (argument type is wrong)
def baz(value: Literal[1]):
    if value == 1:
        ...
    else:
        print(value) # unreachable (function argument type is not Never)