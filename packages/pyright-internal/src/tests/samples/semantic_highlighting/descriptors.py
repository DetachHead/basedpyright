from typing import Callable, Concatenate


class DecFun[T, **P, R]:
    def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
        self.fn = fn

    def __get__(self, instance: T, owner: type[T]) -> Callable[P, R]:
        def fun(*args: P.args, **kwargs: P.kwargs) -> R:
            return self.fn(instance, *args, **kwargs)

        return fun


class DecType[T, **P, R]:
    def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
        self.fn = fn

    def __get__(self, instance: T, owner: type[T]) -> type[T]:
        return owner


class DecSet[T, **P, R]:
    def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
        self.fn = fn

    def __get__(self, instance: T, owner: type[T]):
        return self.__get__

    def __set__(self, instance: T, value: int):
        pass


class Bar:
    @DecFun
    def desc0(self): ...

    @property
    def desc1(self) -> int:
        return 1

    @desc1.setter
    def desc1(self, value: Callable[[], int]):
        _ = value()

    @DecType
    def desc2(self): ...

    @DecSet
    def desc3(self): ...


bar = Bar()
a = bar.desc0
a()
b = bar.desc1
bar.desc1 = lambda: 1
c = bar.desc2
d = bar.desc3
bar.desc3 = 1
