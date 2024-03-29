## Installation

### Language Server

#### VS Code
install the extension from [the vscode extension marketplace](https://marketplace.visualstudio.com/items?itemName=detachhead.basedpyright) or [the open VSX registry](https://open-vsx.org/extension/detachhead/basedpyright)

#### Neovim
BasedPyright is available through the [`nvim-lspconfig`](https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md#basedpyright) adapter for native Neovim's LSP support.  TL;DR simply add this to your Neovim's settings:
```lua
local lspconfig = require("lspconfig")
lspconfig.basedpyright.setup{}
```
Further info for this LSP server options for `nvim-lspconfig` are available on their docs, linked above.

#### Vim
*⚠ basedpyright has not been tested on this editor. if you run into issues with these instructions, please raise an issue.*

Vim/Neovim users can install [coc-pyright](https://github.com/fannheyward/coc-pyright), the Pyright extension for coc.nvim.

Alternatively, [ALE](https://github.com/dense-analysis/ale) will automatically check your code with Pyright if added to the linters list.

#### Sublime Text

Sublime text users can install both [LSP](https://packagecontrol.io/packages/LSP) and [LSP-basedpyright](https://packagecontrol.io/packages/LSP-basedpyright) via [Package Control](https://packagecontrol.io).

#### Emacs
*⚠ basedpyright has not been tested on this editor. if you run into issues with these instructions, please raise an issue.*

Emacs users can install [eglot](https://github.com/joaotavora/eglot) or [lsp-mode](https://github.com/emacs-lsp/lsp-mode) with [lsp-pyright](https://github.com/emacs-lsp/lsp-pyright).

### Command-line

unlike pyright, basedpyright is available as a [pypi package](https://pypi.org/project/basedpyright/) instead of an npm package.

this makes it far more convenient for python developers to use, since there's no need to install any additional tools. just install it normally via your package manager of choice:

<!-- tabs:start -->

#### **pdm**

```
pdm add basedpyright
```

#### **rye**

```
rye add basedpyright
```

#### **uv**

```
uv pip install basedpyright
```

#### **pip**

```
pip install basedpyright
```

<!-- tabs:end -->