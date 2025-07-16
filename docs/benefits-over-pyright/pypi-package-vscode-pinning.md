# pypi package and version pinning

## pypi package - no nodejs required

pyright is only published as an npm package, which requires you to install nodejs. [there is an unofficial version on pypi](https://pypi.org/project/pyright/), but by default it just installs node and the npm package the first time you invoke the cli, [which is quite flaky](https://github.com/RobertCraigie/pyright-python/issues/231).

python developers should not be expected to install nodejs in order to typecheck their python code. although pyright itself is written in typescript and therefore depends on nodejs, it's an implementation detail that should be of no concern to the user. a command-line tool intended for python developers should not have to be installed and managed by a package manager for a completely different language.

this is why basedpyright is [officially published on pypi](https://pypi.org/project/basedpyright/), which comes bundled with the npm package using [nodejs-wheel](https://github.com/njzjz/nodejs-wheel).

see [the installation instructions](../installation/command-line-and-language-server.md#pypi-package-recommended) for more information.

## ability to pin the version used by vscode

in pyright, if the vscode extension gets updated, you may see errors in your project that don't appear in the CI, or vice-versa. see [this issue](https://github.com/microsoft/pylance-release/issues/5207).

basedpyright fixes this problem by adding an `importStrategy` option to the extension, which defaults to looking in your project for the [basedpyright pypi package](#pypi-package-no-nodejs-required).
