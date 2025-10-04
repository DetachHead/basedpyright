# Command-line & language server

## pypi package

unlike pyright, the basedpyright CLI and language server are available as a [pypi package](https://pypi.org/project/basedpyright/).

this makes it far more convenient for python developers to use, since there's no need to install any additional tools. just install it normally via your package manager of choice:

=== "uv (recommended)"

     add it to your project's dev dependencies (recommended):

     ```
     uv add --dev basedpyright
     ```

     or install it globally:

     ```
     uv tool install basedpyright
     ```

=== "pip"

     ```
     pip install basedpyright
     ```

## other installation methods

the basedpyright CLI & language server is also available outside of pypi:

=== "conda"

     ```
     conda install conda-forge::basedpyright
     ```

=== "homebrew"

     ```
     brew install basedpyright
     ```

=== "nixOS"

     [see here](https://search.nixos.org/packages?channel=unstable&show=basedpyright)

=== "npm"

     ```
     npm install basedpyright
     ```

     note that we recommend installing basedpyright via pypi instead - [see here for more information](https://www.npmjs.com/package/basedpyright?activeTab=readme).

     the basedpyright npm package is intended for users who are unable to use the pypi package for some reason. for example if you're using an operating system not [supported by nodejs-wheel](https://github.com/njzjz/nodejs-wheel?tab=readme-ov-file#available-builds) or a version of python older than 3.8.

## usage

once installed, the `basedpyright` and `basedpyright-langserver` scripts will be available in your python environment. when running basedpyright via the command line, use the `basedpyright` command:

```shell
basedpyright --help
```

for instructions on how to use `basedpyright-langserver`, see the [IDE-specific instructions](./ides.md).
