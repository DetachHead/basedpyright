# pypi package and version pinning

## pypi package - no nodejs required

pyright is only published as an npm package, which requires you to install nodejs. [the version on pypi](https://pypi.org/project/pyright/) is just an unofficial wrapper that installs node and the npm package the first time you invoke the cli, [which is quite flaky](https://github.com/RobertCraigie/pyright-python/issues/231).

python developers should not be expected to have to install nodejs in order to typecheck their python code. it should just be a regular pypi package like mypy, ruff, and pretty much all other python tooling. this is why basedpyright is [officially published on pypi](https://pypi.org/project/basedpyright/), which comes bundled with the npm package.

## ability to pin the version used by vscode

in pyright, if the vscode extension gets updated, you may see errors in your project that don't appear in the CI, or vice-versa. see [this issue](https://github.com/microsoft/pylance-release/issues/5207).

basedpyright fixes this problem by adding an `importStrategy` option to the extension, which defaults to looking in your project for the [basedpyright pypi package](#pypi-package-no-nodejs-required).
