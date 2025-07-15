# pylance features

basedpyright re-implements some of the features that microsoft made exclusive to pylance, which is microsoft's closed-source vscode extension built on top of the pyright language server with some additional exclusive functionality ([see the pylance FAQ for more information](https://github.com/microsoft/pylance-release/blob/main/FAQ.md#what-features-are-in-pylance-but-not-in-pyright-what-is-the-difference-exactly)).

the following features have been re-implemented in basedpyright's language server, meaning they are no longer exclusive to vscode. you can use any editor that supports the [language server protocol](https://microsoft.github.io/language-server-protocol/). for more information on installing pyright in your editor of choice, see [the installation instructions](../installation/ides.md).

## jupyter notebooks

just like pylance, the basedpyright language server works with jupyter notebooks:

![](jupyter.png)

however unlike pylance, basedpyright also supports type-checking them using the CLI:

```
>basedpyright
c:\project\asdf.ipynb - cell 1
  c:\project\asdf.ipynb:1:1:12 - error: Type "Literal['']" is not assignable to declared type "int"
    "Literal['']" is not assignable to "int" (reportAssignmentType)
c:\project\asdf.ipynb - cell 2
  c:\project\asdf.ipynb:2:1:12 - error: Type "int" is not assignable to declared type "str"
    "int" is not assignable to "str" (reportAssignmentType)
2 errors, 0 warnings, 0 notes
```

## code actions

### import suggestions

pyright only supports import suggestions as autocomplete suggestions, but not as quick fixes (see [this issue](https://github.com/microsoft/pyright/issues/4263#issuecomment-1333987645)).

basedpyright re-implements pylance's import suggestion code actions:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/a3e8a506-5682-4230-a43c-e815c84889c0)

### ignore comments

basedpyright also re-implements pylance's code actions for adding `# pyright: ignore` comments:

![](./ignore-comment-code-action.png)

!!! note

    `# type: ignore` comments are not supported by this code action because they are discouraged, [see here](../configuration/comments.md#prefer-pyrightignore-comments) for more information.

## semantic highlighting

| before                                                                                                    | after                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ![image](https://github.com/DetachHead/basedpyright/assets/57028336/f2977463-b828-470e-8094-ca437a312350) | ![image](https://github.com/DetachHead/basedpyright/assets/57028336/e2c7999e-28c0-4a4c-b975-f63575ec3404) |

basedpyright re-implements pylance's semantic highlighting along with some additional improvements:

-   supports [the new `type` keyword in python 3.12](https://peps.python.org/pep-0695/)
-   `Final` variables are coloured as read-only

initial implementation of the semantic highlighting provider was adapted from the [pyright-inlay-hints](https://github.com/jbradaric/pyright-inlay-hints) project.

## inlay hints

![image](https://github.com/DetachHead/basedpyright/assets/57028336/41ed93e8-04e2-4163-a1be-c9ec8f3d90df)

basedpyright contains several improvements and bug fixes to the original implementation adapted from [pyright-inlay-hints](https://github.com/jbradaric/pyright-inlay-hints).

basedpyright also supports double-clicking to insert inlay hints. unlike pylance, this also works on `Callable` types:

![](./double-click-inlay-hint.gif)

## docstrings for compiled builtin modules

many of the builtin modules are written in c, meaning the pyright language server cannot statically inspect and display their docstrings to the user. unfortunately they are also not available in the `.pyi` stubs for these modules, as [the typeshed maintainers consider it to be too much of a maintanance nightmare](https://github.com/python/typeshed/issues/4881#issuecomment-1275775973).

pylance works around this problem by running a "docstring scraper" script on the user's machine, which imports compiled builtin modules, scrapes all the docstrings from them at runtime, then saves them so that the language server can read them. however this isn't ideal for a few reasons:

-   only docstrings for modules and functions available on the user's current OS and python version will be generated. so if you're working on a cross-platform project, or code that's intended to be run on multiple versions of python, you won't be able to see docstrings for compiled builtin modules that are not available in your current python installation.
-   the check to determine whether a builtin object is compiled is done at the module level, meaning modules like `re` and `os` which have python source files but contain re-exports of compiled functions, are treated as if they are entirely written in python. this means many of their docstrings are still missing in pylance.
-   it's (probably) slower because these docstrings need to be scraped either when the user launches vscode, or when the user hovers over a builtin class/function (disclaimer: i don't actually know when it runs, because pylance is closed source)

basedpyright solves all of these problems by using [docify](https://github.com/AThePeanut4/docify) to scrape the docstrings from all compiled builtin functions/classes for all currently supported python versions and all platforms (macos, windows and linux), and including them in the default typeshed stubs that come with the basedpyright package.

### examples

here's a demo of basedpyright's builtin docstrings when running on windows, compared to pylance:

#### basedpyright

![](https://github.com/DetachHead/basedpyright/assets/57028336/df4f4916-4b5e-4367-bd88-4ddadf283780)

#### pylance

![](https://github.com/DetachHead/basedpyright/assets/57028336/15a38478-8405-419c-a6e1-3c0801808896)

### generating your own stubs with docstrings

basedpyright uses [docify](https://github.com/AThePeanut4/docify) to add docstrings to its stubs. if you have third party compiled modules and you want basedpyright to see its docstrings, you can do the same:

```
python -m docify path/to/stubs/for/package --in-place
```

or if you're using a different version of typeshed, you can use the `--if-needed` argument to replicate how basedpyright's version of typeshed is generated for your current platform and python version:

```
python -m docify path/to/typeshed/stdlib --if-needed --in-place
```

## renaming packages and modules

when renaming a package or module, basedpyright will update all usages to the new name, just like pylance does:

![](https://github.com/user-attachments/assets/6207fe90-027a-4227-a1ed-d2c4406ad38c)

## fixed parsing of multi-line parameter descriptions in docstrings

in pyright, if a parameter description spans more than one line, only the first line is shown when hovering over the parameter:

![alt text](./broken-docstring-parameter-descriptions.png)

this issue is fixed in pylance, but the fix was never ported to pyright, so we had to fix it ourselves:

![](./fixed-docstring-parameter-descriptions.png)

## automatic conversion to f-string when typing `{` inside a string

basedpyright implements the `autoFormatStrings` setting from pylance ([`basedpyright.analysis.autoFormatStrings`](../configuration/language-server-settings.md#based-settings)):

![](./autoformatstrings.gif)

## Pylance features missing from basedpyright

See the [open issues](https://github.com/DetachHead/basedpyright/issues?q=is:issue+is:open+pylance+label:%22pylance+parity%22) related to feature parity with Pylance.
