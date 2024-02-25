from abc import abstractmethod

from typing_extensions import override


class Foo:
    @abstractmethod
    def __enter__(self) -> None: ...

    def __exit__(self) -> None: ...

    @abstractmethod
    def enter(self) -> None: ...


class Bar(Foo):
    @override
    def __enter__(
        self,
    ) -> None:  #  no error
        ...

    @override
    def __exit__(self) -> None: ...  # error: reportMissingSuperCall

    @override
    def enter(
        self,
    ) -> None:  #  no error
        ...
