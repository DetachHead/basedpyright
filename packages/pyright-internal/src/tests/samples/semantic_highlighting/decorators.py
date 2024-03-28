import dataclasses
from dataclasses import dataclass
import functools
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
