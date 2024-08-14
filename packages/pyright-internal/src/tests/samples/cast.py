from typing import Any, cast, Never
from collections.abc import Mapping

def foo(str_: str, int_or_str: int | str, dict_int_or_none: dict[str, int | None], mapping: Mapping[str, int | None], type_int: type[int], type_any: type[Any], type_object: type[object]):
    cast(int, str_) # error, non-overlapping types
    cast(int | bytes, str_) # error, non-overlapping types
    cast(object, str_) # wider, no error
    cast(int | str, str_) # wider, no error
    cast(Never, int_or_str) # narrower, no error
    cast(int, int_or_str) # narrower, no error
    cast(None, object()) # narrower, no error
    cast(object, None) # wider, no error
    cast(Mapping[str, int], dict_int_or_none) # wider (ignore type parameters), no error
    cast(dict[str, int], mapping) # wider, no error
    cast(dict[str, bytes], mapping) # xfail, https://github.com/DetachHead/basedpyright/issues/259
    cast(type[Any], object()) # narrower, no error
    cast(type[object], object()) # narrower, no error
    cast(type[int], object()) # narrower, no error
    cast(object, type_any) # wider, no error
    cast(object, type_object) # wider, no error
    cast(object, type_int) # wider, no error