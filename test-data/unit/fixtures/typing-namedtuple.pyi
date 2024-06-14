TypeVar = 0
Generic = 0
Any = 0
overload = 0
Type = 0
Literal = 0
Optional = 0
Self = 0
Tuple = 0
ClassVar = 0

T = TypeVar('T')
T_co = TypeVar('T_co', covariant=True)
KT = TypeVar('KT')

class _Callable:
    def __call__(self): pass
class _NamedCallable(_Callable):
    __name__: str
    __qualname__: str
class Iterable(Generic[T_co]): pass
class Iterator(Iterable[T_co]): pass
class Sequence(Iterable[T_co]): pass
class Mapping(Iterable[KT], Generic[KT, T_co]):
    def keys(self) -> Iterable[T]: pass  # Approximate return type
    def __getitem__(self, key: T) -> T_co: pass

class NamedTuple(tuple[Any, ...]):
    _fields: ClassVar[tuple[str, ...]]
    @overload
    def __init__(self, typename: str, fields: Iterable[tuple[str, Any]] = ...) -> None: ...
    @overload
    def __init__(self, typename: str, fields: None = None, **kwargs: Any) -> None: ...
