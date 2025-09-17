import dataclasses
import functools
from dataclasses import dataclass
from typing import final


@dataclass()
class A: ...

@dataclasses.dataclass()
class B:
    @final
    def method(self): ...
    @staticmethod
    def static(): ...

@functools.cache
def cached(): ...

B.static()
