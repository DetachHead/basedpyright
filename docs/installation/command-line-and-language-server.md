# Command-line & language server

## pypi package (recommended)

unlike pyright, the basedpyright CLI & LSP are available as a [pypi package](https://pypi.org/project/basedpyright/) instead of an npm package.

this makes it far more convenient for python developers to use, since there's no need to install any additional tools. just install it normally via your package manager of choice:

=== "uv"

     add it to your project's dev dependencies (recommended):

     ```
     uv add --dev basedpyright
     ```

     or just install it:

     ```
     uv pip install basedpyright
     ```

=== "pdm"

     ```
     pdm add --dev basedpyright
     ```

=== "pip"

     ```
     pip install basedpyright
     ```

## other installation methods

the basedpyright CLI & language server is also available outside of pypi:

=== "homebrew"

     ```
     brew install basedpyright
     ```

=== "nixOS"

     [see here](https://search.nixos.org/packages?channel=unstable&show=basedpyright)

## usage

once installed, the `basedpyright` and `basedpyright-langserver` scripts will be available in your python environment. when running basedpyright via the command line, use the `basedpyright` command:

```shell
basedpyright --help
```

for instructions on how to use `basedpyright-langserver`, see the [IDE-specific instructions below](./ides.md).
