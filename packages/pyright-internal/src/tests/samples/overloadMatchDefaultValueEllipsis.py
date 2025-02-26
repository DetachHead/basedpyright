from typing import Literal, assert_type, overload


@overload
def a(b: Literal[True]) -> int: ...


@overload
def a(b: Literal[False] = ...) -> str: ...


@overload
def a(b: bool = False) -> int | str: ...


def a(b: bool = False) -> int | str: ...    

 
_ = assert_type(a(), str)
  
class Foo:
    def __init__(self, name): 
        pass  

class Bar:
    def __init__(self): 
        pass

 
class Baz:
    def __init__(
        self, x: list[Foo] = None, y: list[Bar] = None
    ):
        pass

 
class testclass2(Baz):
    def __init__(self):
        super().__init__()