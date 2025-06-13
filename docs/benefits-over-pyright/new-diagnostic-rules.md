# new diagnostic rules

this section lists all of the new diagnostic rules that are exclusive to basedpyright and the motivation behind them. for a complete list of all diagnostic rules, [see here](../configuration/config-files.md#type-check-rule-overrides).

## `reportAny`

pyright has a few options to ban "Unknown" types such as `reportUnknownVariableType`, `reportUnknownParameterType`, etc. but "Unknown" is not a real type, rather a distinction pyright uses used to represent `Any`s that come from untyped code or unfollowed imports. if you want to ban all kinds of `Any`, pyright has no way to do that:

```py
def foo(bar, baz: Any) -> Any:
    print(bar) # error: unknown type
    print(baz) # no error
```

basedpyright introduces the `reportAny` option, which will report an error on usages of anything typed as `Any`:

```py
def foo(baz: Any) -> Any:
    print(baz) # error: reportAny
```

## `reportExplicitAny`

similar to [`reportAny`](#reportany), however this rule bans usages of the `Any` type itself rather than expressions that are typed as `Any`:

```py
def foo(baz: Any) -> Any: # error: reportExplicitAny
    print(baz) # error: reportAny
```

## `reportIgnoreCommentWithoutRule`

it's good practice to specify an error code in your `pyright: ignore` comments:

```py
# pyright: ignore[reportUnreachable]
```

this way, if the error changes or a new error appears on the same line in the future, you'll get a new error because the comment doesn't account for the other error.

!!! note

    `type: ignore` comments ([`enableTypeIgnoreComments`](../configuration/config-files.md#enableTypeIgnoreComments)) are unsafe and are disabled by default (see [#330](https://github.com/DetachHead/basedpyright/issues/330) and [#55](https://github.com/DetachHead/basedpyright/issues/55)). we recommend using `pyright: ignore` comments instead.

## `reportPrivateLocalImportUsage`

pyright's `reportPrivateImportUsage` rule only checks for private imports of third party modules inside `py.typed` packages. but there's no reason your own code shouldn't be subject to the same restrictions. to explicitly re-export something, give it a redundant alias [as described in the "Stub Files" section of PEP484](https://peps.python.org/pep-0484/#stub-files) (although it only mentions stub files, other type checkers like mypy have also extended this behavior to source files as well):

```py
# foo.py

from .some_module import a  # private import
from .some_module import b as b  # explicit re-export
```

```py
# bar.py

# reportPrivateLocalImportUsage error, because `a` is not explicitly re-exported by the `foo` module:
from foo import a

# no error, because `b` is explicitly re-exported:
from foo import b
```

## `reportImplicitRelativeImport`

pyright allows invalid imports such as this:

```py
# ./module_name/foo.py:
```

```py
# ./module_name/bar.py:
import foo # wrong! should be `import module_name.foo` or `from module_name import foo`
```

this may look correct at first glance, and will work when running `bar.py` directly as a script, but when it's imported as a module, it will crash:

```py
# ./main.py:
import module_name.bar  # ModuleNotFoundError: No module named 'foo'
```

the new `reportImplicitRelativeImport` rule bans imports like this. if you want to do a relative import, the correct way to do it is by importing it from `.` (the current package):

```py
# ./module_name/bar.py:
from . import foo
```

## `reportInvalidCast`

most of the time when casting, you want to either cast to a narrower or wider type:

```py
foo: int | None
cast(int, foo) #  narrower type
cast(object, foo) #  wider type
```

but pyright doesn't prevent casts to a type that doesn't overlap with the original:

```py
foo: int
cast(str, foo)
```

in this example, it's impossible for `foo` to be a `str` if it's also an `int`, because the `int` and `str` types do not overlap. the `reportInvalidCast` rule will report invalid casts like these.

!!! note "note about casting with `TypedDict`s"

    a common use case of `cast` is to convert a regular `dict` into a `TypedDict`:

    ```py
    foo: dict[str, int | str]
    bar = cast(dict[{"foo": int, "bar": str}], foo)
    ```

    unfortunately, this will cause a `reportInvalidCast` error when this rule is enabled, because although at runtime `TypedDict` is a `dict`, type checkers treat it as an unrelated subtype of `Mapping` that doesn't have a `clear` method, which would break its type-safety if it were to be called on a `TypedDict`.

    this means that although casting between them is a common use case, `TypedDict`s and `dict`s technically do not overlap.

## `reportUnsafeMultipleInheritance`

multiple inheritance in python is awful:

```py
class Foo:
    def __init__(self):
        super().__init__()
class Bar:
    def __init__(self):
        ...

class Baz(Foo, Bar):
    ...

Baz()
```

in this example, `Baz()` calls `Foo.__init__`, and the `super().__init__()` in `Foo` now calls to `Bar.__init__` even though `Foo` does not extend `Bar`.

this is complete nonsense and very unsafe, because there's no way to statically know what the super class will be.

pyright has the `reportMissingSuperCall` rule which, for this reason, complains even when your class doesn't have a base class. but that sucks because there's no way to know what arguments the unknown `__init__` takes, which means even if you do add a call to `super().__init__()` you have no clue what arguments it may take. so this rule is super annoying when it's enabled, and has very little benefit because it barely makes a difference in terms of safety.

`reportUnsafeMultipleInheritance` bans multiple inheritance when there are multiple base classes with an `__init__` or `__new__` method, as there's no way to guarantee that all of them will get called with the correct arguments (or at all). this allows `reportMissingSuperCall` to be more lenient. ie. when `reportUnsafeMultipleInheritance` is enabled, missing `super()` calls will only be reported on classes that actually have a base class.

## `reportUnusedParameter`

pyright will report an unused diagnostic on unused function parameters:

```py
def print_value(value: str): # "value" is not accessed
  print("something else")
```

but this just greys out the parameter instead of actually reporting it as an error. basedpyright introduces a new `reportUnusedParameter` diagnostic rule which supports all the severity options (`"error"`, `"warning"` and `"none"`) as well as `"hint"`, which is the default behavior in pyright.

## `reportImplicitAbstractClass`

abstract classes in python are declared using a base class called `ABC`, and were designed to be validated at runtime rather than by a static type checker. this means that there's no decent way to ensure on a class's definition that it implements all of the required abstract methods:

```py
from abc import ABC, abstractmethod

class AbstractFoo(ABC):
    @abstractmethod
    def foo(self):
        ...

# no error here even though you haven't implemented `foo` because pyright assumes you want this class to also be abstract
class FooImpl(AbstractFoo):
    def bar(self):
        print("hi")

foo = FooImpl() # error
```

this isn't ideal, because you may not necessarily be instantiating the class (eg. if you're developing a library and expect the user to import and instantiate it), meaning this error will go undetected.

the `reportImplicitAbstractClass` rule bans classes like this that are implicitly abstract just because their base class is also abstract. it enforces that the class also explicitly extends `ABC` as well, to indicate that this is intentional:

```py
# even though Foo also extends ABC and this is technically redundant, it's still required to tell basedpyright that you
# are intentionally keeping this class abstract
class FooImpl(AbstractFoo, ABC):
    def bar(self):
        print("hi")
```

## `reportIncompatibleUnannotatedOverride`

pyright's `reportIncompatibleVariableOverride` rule checks for class attribute overrides with an incompatible type:

```py
class A:
    value: int = 1


class B(A):
    value: int | None = None  # error, because `int | None` is not compatible with `int`
```

but it does not report an error if the attribute in the base class does not have a type annotation:

```py
class A:
    value = 1  # inferred as `int`


class B(A):
    value = None  # no error, even though the type on the base class is `int` and the type here is `None`
```

this rule will report an error in such cases.

!!! warning

    the reason pyright does not check for cases like this is allegedly because it would be "very slow" to do so. in our testing, we have not noticed any performance impact with this rule enabled, but just in case, it's disabled by default in [the "recommended" diagnostic ruleset](../configuration/config-files.md#recommended-and-all) for now.

    we intend to enable this rule by default in the future once we are more confident with it. please [open an issue](https://github.com/DetachHead/basedpyright/issues/new?template=issue.yaml) if you notice basedpyright running noticably slower with this rule enabled.

    if you encounter any performance issues with this rule, you may want to disable it and use [`reportUnannotatedClassAttribute`](#reportunannotatedclassattribute) instead.

## `reportUnannotatedClassAttribute`

since pyright does not warn when a class attribute without a type annotation is overridden with an incompatible type (see [`reportIncompatibleUnannotatedOverride`](#reportincompatibleunannotatedoverride)), you may want to enforce that all class attributes have a type annotation. this can be useful as an alternative to `reportIncompatibleUnannotatedOverride` if:

-   you are developing a library that you want to be fully type-safe for users who may be using pyright instead of basedpyright
-   you encountered performance issues with `reportIncompatibleUnannotatedOverride`
-   you prefer explicit type annotations to reduce the risk of introducing unexpected breaking changes to your API

`reportUnannotatedClassAttribute` will report an error on all unannotated class attributes that can potentially be overridden (ie. not final or private), even if they don't override an attribute on a base class with an incompatible type.

## `reportInvalidAbstractMethod`

pyright ignores methods decorated with `@abstractmethod` if the class is not abstract:

```py
from abc import abstractmethod


class Foo:
    @abstractmethod
    def foo(): ...

_ = Foo()  # no error
```

this is allegedly for [performance reasons](https://github.com/microsoft/pyright/issues/5026#issuecomment-1526479622), but basedpyright's `reportInvalidAbstractMethod` rule is reported on the method definition instead of the usage, so it doesn't have to check every method when instantiating every non-abstract class.

it also just makes more sense to report the error on the method definition anyway. methods decorated with `@abstractmethod` on classes that do not extend `ABC` will not raise a runtime error if they are instantiated, making them less safe.
