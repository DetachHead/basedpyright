# fixes for existing diagnostic rules

## `reportRedeclaration` and `reportDuplicateImport`

pyright does not report redeclarations if the redeclaration has the same type:

```py
foo: int = 1
foo: int = 2  # no error
```

nor does it care if you have a duplicated import in multiple different `import` statements, or in aliases:

```py
from foo import bar
from bar import bar  # no error
from baz import foo as baz, bar as baz  # no error
```

basedpyright solves both of these problems by always reporting an error on a redeclaration or an import with the same name as an existing import.

## `reportUnreachable`

[`reportUnreachable`](../configuration/config-files.md#reportUnreachable) was the first new diagnostic rule that was added to basedpyright, however this rule was recently added to pyright too, but their version is far less safe. specifically, it doesn't report an error on `sys.version_info` or `sys.platform` checks, which are by far the most common cases where pyright considers code to be unreachable.

the reason we added `reportUnreachable` to basedpyright was not just to identify code that will never be reached, but mainly to identify code that will _not be type checked._

!!! example

    assuming that you're running python 3.13 or above during development:
    ```py
    if sys.version_info < (3, 13):
        1 + "" # no error
    ```

    normally `1 + ""` would be reported as a type error but pyright doesn't complain here, because unreachable code doesn't get type checked at all! this is bad of course, because chances are if your code contains an `if` statement like this, you're expecting it to be run on multiple different python versions.
