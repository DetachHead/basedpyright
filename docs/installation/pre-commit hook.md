# pre-commit hook

```yaml title=".pre-commit-config.yaml"
repos:
    - repo: https://github.com/DetachHead/basedpyright-pre-commit-mirror
      rev: v1.13.0 # or whatever the latest version is at the time
      hooks:
          - id: basedpyright
```

## should i use this?

we don't recommend pre-commit as there are better alternatives for most of its use cases. also its maintainer is notoriously very rude to users.

we will continue to support pre-commit, however there are alternative approaches you may want to consider depending on your use case.

### checking your code before committing

we instead recommend [integrating basedpyright with your IDE](./ides.md). doing so will show errors on your code as you write it, instead of waiting until you go to commit your changes.

### running non-python tools in a python project

pre-commit can be useful when the tool does not have a pypi package, because it can automatically manage nodejs and install npm packages for you without you ever having to install nodejs yourself. basedpyright already solves this problem with pyright by [bundling the npm package as a pypi package](../benefits-over-pyright/pypi-package-vscode-pinning.md), so you don't need to use pre-commit.

### running basedpyright in the CI

basedpyright already [integrates well with CI by default](../benefits-over-pyright/improved-ci-integration.md) when using the pypi package.

!!! tip "if you still want to use the pre-commit hook"

    you may want to check out [prek](https://github.com/j178/prek) instead, which is a drop-in replacement for pre-commit written in rust (🚀)
