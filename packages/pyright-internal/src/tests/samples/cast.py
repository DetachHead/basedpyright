from typing import cast, Never

def foo(str_: str, int_or_str: int | str):
    cast(int, str_) # error, non-overlapping types
    cast(object, str_) # wider, no error
    cast(int | str, str_) # wider, no error
    cast(Never, int_or_str) # narrower, no error
    cast(int, int_or_str) # narrower, no error