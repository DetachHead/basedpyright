# improved type narrowing

when narrowing a type using an `isinstance` check, there's no way for the type checker to narrow its type variables, so pyright just narrows them to ["Unknown"](../usage/mypy-comparison.md#unknown-type-and-strict-mode)):

```py
def foo(value: object):
    if isinstance(value, list):
        reveal_type(value) # list[Unknown]
```

this makes sense in cases where the generic is invariant and there's no other way to represent any of its possibilities. for example if it were to be narrowed to `list[object]`, you wouldn't be able to assign `list[int]` to it. however in cases where the generic is covariant, contravariant, or uses constraints, it can be narrowed more accurately.

basedpyright introduces the new [`strictGenericNarrowing`](../configuration/config-files.md#strictGenericNarrowing) setting to address this. the following sections explain how this new behavior effects different types of generics.

## narrowing of covariant generics

when a type variable is covariant, its widest possible type is its bound, which defaults to `object`.

when `strictGenericNarrowing` is enabled, if a generic is covariant and does not have a bound, it gets narrowed to `object` instead of "Unknown":

```py
T_co = TypeVar("T_co", covariant=True)

class Foo(Generic[T_co]):
    ...

def foo(value: object):
    if isinstance(value, Foo):
        reveal_type(value)  # Foo[object]
```

if the generic does have a bound, it gets narrowed to that bound instead:

```py
T_co = TypeVar("T_co", bound=int | str, covariant=True)

class Foo(Generic[T_co]):
    ...

def foo(value: object):
    if isinstance(value, Foo):
        reveal_type(value)  # Foo[int | str]
```

## narrowing of contravariant generics

when a type variable is contravariant its widest possible type is `Never`, so when `strictGenericNarrowing` is enabled, contravariant generics get narrowed to `Never` instead of "Unknown":

```py
T_contra = TypeVar("T_contra", bound=int | str, covariant=True)

class Foo(Generic[T_contra]):
    ...

def foo(value: object):
    if isinstance(value, Foo):
        reveal_type(value)  # Foo[Never]
```

## narrowing of constraints

when a type variable uses constraints, the rules of variance do not apply - see [this issue](https://github.com/DetachHead/basedpyright/issues/893) for more information. instead, a constraint declares that the generic must be resolved to be exactly one of the types specified.

when `strictGenericNarrowing` is enabled, constrained generics are narrowed to a union of all possibilities:

```py
class Foo[T: (int, str)]:
    ...

def foo(value: object):
    if isinstance(value, Foo):
        reveal_type(value)  # Foo[int] | Foo[str]
```

this also works when there's more than one constrained type variable - it creates a union of all possible combinations:

```py

class Foo[T: (int, str), U: (float, bytes)]:
    ...

def foo(value: object):
    if isinstance(value, Foo):
        reveal_type(value)  #  Foo[int, float] | Foo[int, bytes] | Foo[str, float] | Foo[str, bytes]
```
