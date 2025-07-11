import re
from collections.abc import Iterable, Iterator
from typing import Any, ClassVar
from typing_extensions import Self

from .connections import Connection

RE_INSERT_VALUES: re.Pattern[str]

class Cursor:
    max_stmt_length: ClassVar[int]
    connection: Connection[Any]
    description: tuple[str, ...]
    rownumber: int
    rowcount: int
    arraysize: int
    messages: Any
    errorhandler: Any
    lastrowid: int
    def __init__(self, connection: Connection[Any]) -> None: ...
    def close(self) -> None: ...
    def setinputsizes(self, *args) -> None: ...
    def setoutputsizes(self, *args) -> None: ...
    def nextset(self) -> bool | None: ...
    def mogrify(self, query: str, args: object = None) -> str: ...
    def execute(self, query: str, args: object = None) -> int: ...
    def executemany(self, query: str, args: Iterable[object]) -> int | None: ...
    def callproc(self, procname: str, args: Iterable[Any] = ()) -> Any: ...
    def scroll(self, value: int, mode: str = "relative") -> None: ...
    def __enter__(self) -> Self: ...
    def __exit__(self, *exc_info: object) -> None: ...
    # Methods returning result tuples are below.
    def fetchone(self) -> tuple[Any, ...] | None: ...
    def fetchmany(self, size: int | None = None) -> tuple[tuple[Any, ...], ...]: ...
    def fetchall(self) -> tuple[tuple[Any, ...], ...]: ...
    def __iter__(self) -> Iterator[tuple[Any, ...]]: ...
    def __next__(self): ...

class DictCursorMixin:
    dict_type: Any  # TODO: add support if someone needs this
    def fetchone(self) -> dict[str, Any] | None: ...
    def fetchmany(self, size: int | None = ...) -> tuple[dict[str, Any], ...]: ...
    def fetchall(self) -> tuple[dict[str, Any], ...]: ...
    def __iter__(self) -> Iterator[dict[str, Any]]: ...

class SSCursor(Cursor):
    def __del__(self) -> None: ...
    def read_next(self): ...
    def fetchall(self) -> list[tuple[Any, ...]]: ...  # type: ignore[override]
    def fetchall_unbuffered(self) -> Iterator[tuple[Any, ...]]: ...
    def scroll(self, value: int, mode: str = "relative") -> None: ...

class DictCursor(DictCursorMixin, Cursor): ...  # type: ignore[misc]

class SSDictCursor(DictCursorMixin, SSCursor):  # type: ignore[misc]
    def fetchall_unbuffered(self) -> Iterator[dict[str, Any]]: ...  # type: ignore[override]
