from typing import Callable, TypeVar

F = TypeVar("F", bound=Callable[..., object])

def arguments_match_parameter_names(fn: F, /) -> F: ...
