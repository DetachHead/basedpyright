# inline `TypedDict` support

pyright used to support defining `TypedDict`s inline, like so:

```py
foo: dict[{"foo": int, "bar": str}] = {"foo": "a", "bar": 1}
```

this was an experimental feature and was removed because it never made it into a PEP. but this functionality is very convenient and we see no reason not to continue supporting it, so we added it back in basedpyright.

this can be disabled by setting `enableExperimentalFeatures` to `false`.
