# better defaults

we believe that type checkers and linters should be as strict as possible by default. this ensures that the user aware of all the available rules so they can more easily make informed decisions about which rules they don't want enabled in their project. that's why the following defaults have been changed in basedpyright.

## `typeCheckingMode`

used to be `"basic"`, but now defaults to `"recommended"`, which enables all diagnostic rules by default. this may seem daunting at first, however we have some solutions to address some concerns users may have with this mode:

-   less severe diagnostic rules are reported as warnings instead of errors. this reduces [alarm fatigue](https://en.wikipedia.org/wiki/Alarm_fatigue) while still ensuring that you're aware of all potential issues that basedpyright can detect. [`failOnWarnings`](../configuration/config-files.md#failOnWarnings) is also enabled by default in this mode, which causes the CLI to exit with a non-zero exit code if any warnings are detected. you disable this behavior by setting `failOnWarnings` to `false`.
-   we support [baselining](./baseline.md) to allow for easy adoption of more strict rules in existing codebases.
-   we've added a new setting, [`allowedUntypedLibraries`](../configuration/config-files.md#allowedUntypedLibraries) which allows you to turn off rules about unknown types on a per-module basis, which can be useful when working with third party packages that aren't properly typed.

## `pythonPlatform`

used to assume that the operating system pyright is being run on is the only operating system your code will run on, which is rarely the case. in basedpyright, `pythonPlatform` defaults to `All`, which assumes your code can run on any operating system.

## default value for `pythonPath`

configuring your python interpreter in pyright is needlessly confusing. if you aren't using vscode or you aren't running it from inside a virtual environment, you'll likely encounter errors for unresolved imports as a result of pyright using the wrong interpreter. to fix this you'd have to use the `venv` and `venvPath` settings which are unnecessarily difficult to use. for example `venv` can only be set in either [the config file](../configuration/config-files.md) or [the language server settings](../configuration/language-server-settings.md) but `venvPath` can only be set in the language server settings or [the command line](../configuration/command-line.md).

most of the time your virtual environment is located in the same spot: a folder named `.venv` in your project root. this is the case if you're using [uv](https://docs.astral.sh/uv/) (which you should be, it's far better than any alternative).

so why not just check for this known common venv path and use that by default? that's exactly what basedpyright does. if neither `pythonPath` or `venvPath`/`venv` are set, basedpyright will check for a venv at `./.venv` and if it finds one, it will use its python interpreter as the value for `pythonPath`.
