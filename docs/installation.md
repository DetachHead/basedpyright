# Installation

## Command-line & language server

### pipi package (recommended)

unlike pyright, the basedpyright CLI & LSP are available as a [pypi package](https://pypi.org/project/basedpyright/) instead of an npm package.

this makes it far more convenient for python developers to use, since there's no need to install any additional tools. just install it normally via your package manager of choice:

<!-- tabs:start -->

### **uv**

add it to your project's dev dependencies (recommended):
```
uv add --dev basedpyright
```

or just install it:
```
uv pip install basedpyright
```

### **pdm**

```
pdm add --dev basedpyright
```

### **pip**

```
pip install basedpyright
```

<!-- tabs:end -->

### other installation methods

the basedpyright CLI & language server is also available outside of pypi:

<!-- tabs:start -->

### **homebrew**

```
brew install basedpyright
```

### **nixOS**

[see here](https://search.nixos.org/packages?channel=unstable&show=basedpyright)

<!-- tabs:end -->

### usage

once installed, the `basedpyright` and `basedpyright-langserver` scripts will be available in your python environment. when running basedpyright via the command line, use the `basedpyright` command:

```shell
basedpyright --help
```

for instructions on how to use `basedpyright-langserver`, see the [IDE-specific instructions below](#ides).

## IDEs

most of these IDE plugins require [the pypi package to be installed](#command-line--language-server).

### VS Code

install the extension from [the vscode extension marketplace](https://marketplace.visualstudio.com/items?itemName=detachhead.basedpyright)

### VSCodium

install the extension from [the open VSX registry](https://open-vsx.org/extension/detachhead/basedpyright)

### Neovim
You need to install the LSP client addapter plugin,
[nvim-lspconfig](https://github.com/neovim/nvim-lspconfig), for setting up the
LSP for the editor.  These configurations are for launching the LSP server,
as well as for being able to give launching parameters at the same time.

To install the **necessary sever command**, for the LSP server itself, use the
[pypi package installation method](#command-line--language-server) (as
mentioned previously in this section).  Or if already using
[Mason.nvim](https://github.com/williamboman/mason.nvim), follow their
instructions for installing their packages.  The latter approach allows you to
have the version of BasedPyright maintained and upgraded by Mason project.

#### Setting-up Neovim
BasedPyright is available through the
[`nvim-lspconfig`](https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md#basedpyright)
adapter for native Neovim's LSP support.

After having both, the client-side plugin and the LSP server command installed,
simply add this settings to your Neovim's settings:
```lua
local lspconfig = require("lspconfig")
lspconfig.basedpyright.setup{}
```
Further info for this LSP server options for `nvim-lspconfig` are available on
their docs, linked above.

### Vim

Vim users can install [coc-basedpyright](https://github.com/fannheyward/coc-basedpyright), the BasedPyright extension for coc.nvim.

### Sublime Text

Sublime text users can install both [LSP](https://packagecontrol.io/packages/LSP) and [LSP-basedpyright](https://packagecontrol.io/packages/LSP-basedpyright) via [Package Control](https://packagecontrol.io).

### Emacs

Emacs users have 3 options:

#### [lsp-bridge](https://github.com/manateelazycat/lsp-bridge)

basedpyright is the default language server for python in lsp-bridge, so no additional configuration is required.

#### [eglot](https://github.com/joaotavora/eglot)

add the following to your emacs config:

```emacs-lisp
(add-to-list 'eglot-server-programs
             '((python-mode python-ts-mode)
               "basedpyright-langserver" "--stdio"))
```

#### [lsp-mode](https://github.com/emacs-lsp/lsp-mode)

with [lsp-pyright](https://github.com/emacs-lsp/lsp-pyright) (any commit after: `0c0d72a`, update the package if you encounter errors), add the following to your emacs config:

```emacs-lisp
(setq lsp-pyright-langserver-command "basedpyright")
```

### PyCharm

install the [Pyright](https://plugins.jetbrains.com/plugin/24145) plugin

configure it to use basedpyright by specifying the path to the `basedpyright-langserver` executable and set "Running mode" to "LSP4IJ":

![](https://github.com/user-attachments/assets/accfc498-825c-4c39-9e2c-35195c41fd67)

### Helix

Install the LSP server itself, using the [pypi package installation method](#command-line--language-server) (as mentioned previously in this section).
Then add the following to your [languages file](https://docs.helix-editor.com/languages.html):

```toml
[[language]]
name = "python"
language-servers = [ "basedpyright" ]
```

You can verify the active configuration by running `hx --health python`
