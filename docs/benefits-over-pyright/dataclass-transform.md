# Extra `dataclass_transform` features

`typing.dataclass_transform` is a bit strange.
It is a compromise to fulfill the urgent need to support dataclass-like objects
(mostly in `pydantic` and `attrs`) to some extent without adding a generic and flexible
mechanism for defining your own `dataclass_transform`.

If your use case deviates from what `dataclass_transform` explicitly supports,
it can be difficult or impossible to work around that.

Luckily, `dataclass_transform` accepts arbitrary keyword arguments at runtime
to allow type checkers to add their own little hacks on top of the standard ones.

`basedpyright` currently supports these options:

-   `skip_replace`: setting this to `True` disables the synthesis of the `__replace__` method.

    Pyright (and basedpyright) assumes that classes produced by a dataclass transform
    define a `__replace__` method, as long as the class is not marked with `init=False` and does
    not define a custom `__init__` method.
    However, `typing.dataclass_transform` doesn't require that the `__replace__` method is defined.

    In addition, `__replace__` messes with the variance inference of frozen dataclasses (see
    [this discourse thread](https://discuss.python.org/t/make-replace-stop-interfering-with-variance-inference/96092)
    for details). Here's a recipe you can use to work around this:

    ```py
    from typing import dataclass_transform

    @dataclass_transform(skip_replace=True, frozen_default=True)
    def frozen[T: type](t: T) -> T:
        return dataclass(frozen=True, slots=True)(t)

    # check that this enables covariance:
    @frozen
    class Box[T]:
        value: T

    box1: Box[str] = Box("test")
    box2: Box[str | int] = box1
    ```

All of these options require the [`enableBasedFeatures`](../configuration/config-files.md#enableBasedFeatures)
configuration option to be set to `true`.
