# better defaults

we believe that type checkers and linters should be as strict as possible by default. this ensures that the user aware of all the available rules so they can more easily make informed decisions about which rules they don't want enabled in their project. that's why the following defaults have been changed in basedpyright.

## `typeCheckingMode`

used to be `"basic"`, but now defaults to `"recommended"`, which enables all diagnostic rules by default. this may seem daunting at first, however we have some solutions to address some concerns users may have with this mode:

-   less severe diagnostic rules are reported as warnings instead of errors. this reduces [alarm fatigue](https://en.wikipedia.org/wiki/Alarm_fatigue) while still ensuring that the user is made aware of all potentential issues that basedpyright can detect. `failOnWarnings` is also enabled by default in this mode, which causes the CLI to exit with a non-zero exit code if any warnings are detected. you disable this behavior by setting `failOnWarnings` to `false`.
-   we support [baselining](./baseline.md) to allow for easy adoption of more strict rules in existing codebases.

## `pythonPlatform`

used to assume that the operating system pyright is being run on is the only operating system your code will run on, which is rarely the case. in basedpyright, `pythonPlatform` defaults to `All`, which assumes your code can run on any operating system.
