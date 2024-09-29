# fixes for the `reportRedeclaration` and `reportDuplicateImport` rules

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