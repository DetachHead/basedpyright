# fixed handling for context managers that can suppress exceptions

## the problem

if an exception is raised inside a context manager and its `__exit__` method returns `True`, it will be suppressed:

```py
class SuppressError(AbstractContextManager[None, bool]):
    @override
    def __enter__(self) -> None:
        pass

    @override
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
        /,
    ) -> bool:
        return True
```

but if it returns `False` or `None`, the exception will not be suppressed:

```py
class Log(AbstractContextManager[None, Literal[False]]):
    @override
    def __enter__(self) -> None:
        print("entering context manager")

    @override
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
        /,
    ) -> Literal[False]:
        print("exiting context manager")
        return False
```

pyright will take this into account when determining reachability:

```py
def raise_exception() -> Never:
    raise Exception

with SuppressError():  # see definition for `SuppressError` above
    foo: int = raise_exception()

# when the exception is raised, the context manager exits before foo is assigned to:
print(foo)  # error: "foo" is unbound (reportPossiblyUnboundVariable)
```

```py
with Log():  # see definition for `Log` above
    foo: int = raise_exception()

# when the exception is raised, it does not get suppressed so this line can never run:
print(foo)  # error: Code is unreachable (reportUnreachable)
```

however, due to [a bug in mypy](https://github.com/python/mypy/issues/8766) that [pyright blindly copied and accepted as the "standard"](https://github.com/microsoft/pyright/issues/6034#issuecomment-1738941412), a context manager will incorrectly be treated as if it never suppresses exceptions if its return type is a union of `bool | None`:

```py
class SuppressError(AbstractContextManager[None, bool | None]):
    @override
    def __enter__(self) -> None:
        pass

    @override
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
        /,
    ) -> bool | None:
        return True


with SuppressError():
    foo: int = raise_exception()

# this error is wrong because this line is actually reached at runtime:
print(foo)  # error: Code is unreachable (reportUnreachable)
```

## the solution

basedpyright introduces a new setting, `strictContextManagerExitTypes` to address this issue. when enabled, context managers where the `__exit__` dunder returns `bool | None` are treated the same way as context managers that return `bool` or `Literal[True]`. put simply, if `True` is assignable to the return type, then it's treated as if it can suppress exceptions.

## issues with `@contextmanager`

the reason we support disabling this fix using the `strictContextManagerExitTypes` setting is because it will cause all context managers decorated with `@contextlib.contextmanager` to be treated as if they can suppress an exception, even if they never do:

```py
@contextmanager
def log():
    print("entering context manager")
    try:
        yield
    finally:
        print("exiting context manager")

with log():
    foo: int = get_value()

# basedpyright accounts for the possibility that get_value raised an exception and foo
# was never assigned to, even though this context manager never suppresses exceptions
print(foo)  # error: "foo" is unbound (reportPossiblyUnboundVariable)
```

this is because there's no way to tell a type checker whether the function body wraps the `yield` statement inside a `try`/`except` statement, which is necessary to suppress exeptions when using the `@contextmanager` decorator:

```py
@contextmanager
def suppress_error():
    try:
        yield
    except:
        pass
```

due to this limitation in the type system, the `@contextmanager` dectorator always modifies the return type of generator functions from `Iterator[T]` to `_GeneratorContextManager[T]`, which extends `AbstractContextManager[T, bool | None]`.

```py
# contextlib.pyi

def contextmanager(func: Callable[_P, Iterator[_T_co]]) -> Callable[_P, _GeneratorContextManager[_T_co]]: ...

class _GeneratorContextManager(_GeneratorContextManagerBase, AbstractContextManager[_T_co, bool | None], ContextDecorator):
    ...
```

and since `bool | None` is used for the return type of `__exit__`, basedpyright will assume that all `@contextllib.contextmanager`'s have the ability to suppress exceptions when `strictContextManagerExitTypes` is enabled.

as a workaround, it's recommended to instead use class context managers [like in the examples above](#the-problem) for the following reasons:

-   it forces you to be explicit about whether or not the context manager is able to suppress an exception
-   it prevents you from accidentally creating a context manager that doesn't run its cleanup if an exception occurs:
    ```py
    @contextmanager
    def suppress_error():
        print("setup")
        yield
        # this part won't run if an exception is raised because you forgot to use a try/finally
        print("cleanup")
    ```

if you're dealing with third party modules where the usage of `@contextmanager` decorator is unavoidable, it may be best to just disable `strictContextManagerExitTypes` instead.
