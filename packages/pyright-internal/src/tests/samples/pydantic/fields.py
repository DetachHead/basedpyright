from typing import Any, Callable, Tuple, dataclass_transform

def Field(
        *,
        default: Any = ...,
        default_factory: Callable[[], Any] | None = ...,
        alias: str | None = ...,
        validation_alias: str | None = ...,
        kw_only: bool | None = ...,
        init: bool | None = ...,
        converter: Any = ...,
        factory: Callable[[], Any] | None = ...,
) -> Any: ...
