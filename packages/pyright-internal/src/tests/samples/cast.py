from typing import cast, Never
from collections.abc import Mapping

def foo(str_: str, int_or_str: int | str, dict_int_or_none: dict[str, int | None], mapping: Mapping[str, int | None]):
    cast(int, str_) # error, non-overlapping types
    cast(int | bytes, str_) # error, non-overlapping types
    cast(object, str_) # wider, no error
    cast(int | str, str_) # wider, no error
    cast(Never, int_or_str) # narrower, no error
    cast(int, int_or_str) # narrower, no error
    cast(Mapping[str, int], dict_int_or_none) # wider (ignore type parameters), no error
    cast(dict[str, int], mapping) # wider, no error
    cast(dict[str, bytes], mapping) # xfail, https://github.com/DetachHead/basedpyright/issues/259
