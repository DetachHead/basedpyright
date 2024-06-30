from typing import Any, assert_type


def foo(value: object):
    print(value)
    if isinstance(value, list):
        _ = assert_type(value, list[Any])
    _ = assert_type(value, object)

def bar(value: object):
    print(value)
    if isinstance(value, list):
        _ = assert_type(value, list[Any])
    else:
        _ = assert_type(value, object)
    _ = assert_type(value, object)