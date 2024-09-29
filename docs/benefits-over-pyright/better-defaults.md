# better defaults

we believe that type checkers and linters should be as strict as possible by default, making the user aware of all the available rules so they can more easily make informed decisions about which rules they don't want enabled in their project. that's why the following defaults have been changed in basedpyright

## `typeCheckingMode`

used to be `basic`, but now defaults to `all`. while this may seem daunting at first, we support [baselining](./baseline.md) to allow for easy adoption of more strict rules in existing codebases.

## `pythonPlatform`

used to assume that the operating system pyright is being run on is the only operating system your code will run on, which is rarely the case. in basedpyright, `pythonPlatform` defaults to `All`, which assumes your code can run on any operating system.
