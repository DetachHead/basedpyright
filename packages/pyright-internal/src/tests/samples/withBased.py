import contextlib
from types import TracebackType
from typing import Iterator, Literal

from typing_extensions import assert_never

class BoolOrNone(contextlib.AbstractContextManager[None]):
    def __exit__(
        self,
        __exc_type: type[BaseException] | None,
        __exc_value: BaseException | None,
        __traceback: TracebackType | None,
    ) -> bool | None:
        ...

def _():
    with BoolOrNone():
        raise Exception
    print(1)  # reachable

class TrueOrNone(contextlib.AbstractContextManager[None]):
    def __exit__(
        self,
        __exc_type: type[BaseException] | None,
        __exc_value: BaseException | None,
        __traceback: TracebackType | None,
    ) -> Literal[True] | None:
        ...

def _():
    with TrueOrNone():
        raise Exception
    print(1)  # reachable


class FalseOrNone(contextlib.AbstractContextManager[None]):
    def __exit__(
        self,
        __exc_type: type[BaseException] | None,
        __exc_value: BaseException | None,
        __traceback: TracebackType | None,
    ) -> Literal[False] | None:
        ...

def _():
    with FalseOrNone():
        raise Exception
    print(1)  # unreachable


class OnlyNone(contextlib.AbstractContextManager[None]):
    def __exit__(
        self,
        __exc_type: type[BaseException] | None,
        __exc_value: BaseException | None,
        __traceback: TracebackType | None,
    ) -> None:
        ...

def _():
    with OnlyNone():
        raise Exception
    print(1)  # unreachable