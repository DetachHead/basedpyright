from typing import Never

foo: Never
bar = Never

def baz() -> Never:
    ...

def asdf(foo: Never):
    value: Never = foo
    value

Type = Never
value: Type = 1

def inferred():
    value = ''
    if not isinstance(value, str):
        value