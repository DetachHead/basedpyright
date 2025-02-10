# language server improvements

in addition to the [pylance exclusive features](./pylance-features.md), basedpyright also contains some additional improvements to the language server that aren't available in pyright or pylance.

## autocomplete improvements

autocomplete suggestions for method overrides will automatically add the `@override` decorator:

![](./override-decorator-completions.gif)

## improved diagnostic severity system

in pyright, certain diagnostics such as unreachable and unused code are always reported as a hint and cannot be disabled even when the associated diagnostic rule is disabled (and in the case of unreachable code, [there is no diagnostic rule at all](./new-diagnostic-rules.md#reportunreachable)).

basedpyright introduces a new [`"hint"`](../configuration/config-files.md#diagnostic-categories) diagnostic category which can be applied to any diagnostic rule, and can be disabled just like all other diagnostic rules. diagnostics that are reported as a `"hint"` can have diagnostic tags (unused or deprecated) that change how they're displayed if supported by your IDE, if such a tag is relevant for that rule:

```toml title="pyproject.toml"
[tool.basedpyright]
reportUnreachable = 'hint'
reportUnusedParameter = 'hint'
reportUnusedCallResult = 'hint'
reportDeprecated = 'hint'
```

here's how they look in vscode:

![](diagnostic-tags.png)
