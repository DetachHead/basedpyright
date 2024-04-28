from typing_extensions import TypeVar, ParamSpec

sss = str(1)  # inlay hint
foo = 1  # no inlay hint because Literal
T = TypeVar(name="T") # no inlay hint because typevar
U = TypeVar(name="U", bound=int) # no inlay hint because typevar
P = ParamSpec(name="P") # no inlay hint because paramspec
_ = str(1)  # no inlay hint because underscore only variable
Foo = int  # inlay hint of "TypeAlias"
type Bar = str  # no inlay hint
def asdf(a: Foo, b: type[Foo]) -> None:
    foo = a # inlay hint, it's an instance not a type
    bar = b # inlay hint of "TypeAlias", parameters that where the values are types are valid as type annotations