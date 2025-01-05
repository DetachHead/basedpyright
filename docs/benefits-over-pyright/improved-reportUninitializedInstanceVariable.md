# improved logic for detecting uninitialized instance variables

in pyright, the [`reportUninitializedInstanceVariable`](../configuration/config-files.md#reportUninitializedInstanceVariable) rule will report cases where an instance attribute is defined but not initialized:

```py
class A:
    x: int  # error: Instance variable "x" is not initialized in the class body or __init__ method

    def reset(self):
        # there's no guarantee this will be called so it doesn't count
        self.x = 3
```

however, it's very common to write constructors that call a "reset" method. pyright doesn't account for this, so `reportUninitializedInstanceVariable` is still reported even though the attribute will always be initialized.

basedpyright checks the class's `__init__` method for calls to other methods that may initialize instance attributes to eliminate such false positives:

```py
class A:
    x: int  # error in pyright, no error in basedpyright

    def __init__(self) -> None:
        self.reset()

    def reset(self):
        self.x = 3
```

## limitations

for performance reasons, this only checks one call deep from the `__init__` method, so the following class will still report an error:

```py
class A:
    x: int  # reportUninitializedInstanceVariable error

    def __init__(self) -> None:
        self.initialize()

    def initialize(self):
        self.reset()

    def reset(self):
        self.x = 3
```

although this compromise is not ideal, we've found that this change still eliminates a very common source of false positives for this rule.
