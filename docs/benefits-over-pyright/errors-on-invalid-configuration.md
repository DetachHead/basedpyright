# errors on invalid configuration

in pyright, if you have any invalid configuration, it may or may not print a warning to the console, then it will continue type-checking and the exit code will be 0 as long as there were no type errors:

```toml
[tool.pyright]
mode = "strict"  # wrong! the setting you're looking for is called `typeCheckingMode`
```

in this example, it's very easy for errors to go undetected because you thought you were on strict mode, but in reality pyright just ignored the setting and silently continued type-checking on "basic" mode.

to solve this problem, basedpyright will exit with code 3 on any invalid config when using the CLI, and show an error notification when using the language server.