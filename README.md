<h1><img src="https://github.com/DetachHead/basedpyright/assets/57028336/c7342c31-bf23-413c-af6d-bc430898b3dd"> basedpyright</h1>

[![pypi](https://img.shields.io/pypi/dm/basedpyright?logo=pypi&color=3775A9)](https://pypi.org/project/basedpyright/) [![visual studio marketplace](https://img.shields.io/visual-studio-marketplace/d/detachhead.basedpyright?logo=visualstudiocode&color=007ACC
)](https://marketplace.visualstudio.com/items?itemName=detachhead.basedpyright) [![open VSX](https://img.shields.io/open-vsx/dt/detachhead/basedpyright?logo=vscodium&color=2F80ED)](https://open-vsx.org/extension/detachhead/basedpyright) [![nvim-lspconfig](https://img.shields.io/badge/nvim--lspconfig-grey?logo=neovim)](https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md#basedpyright) [![coc.nvim](https://img.shields.io/badge/coc.nvim-grey?logo=vim)](https://github.com/fannheyward/coc-basedpyright) [![sublime text](https://img.shields.io/packagecontrol/dt/LSP-basedpyright?logo=sublimetext&color=FF9800)](https://packagecontrol.io/packages/LSP-basedpyright) [![pycharm](https://img.shields.io/jetbrains/plugin/v/24145?logo=pycharm&color=000000)](./docs/installation.md#pycharm) [![Discord](https://img.shields.io/discord/948915247073349673?logo=discord&color=5865F2)](https://discord.gg/7y9upqPrk2) [![basedpyright - checked](https://img.shields.io/badge/basedpyright-checked-42b983)](https://detachhead.github.io/basedpyright)

Basedpyright is a fork of [pyright](https://github.com/microsoft/pyright) with various type checking improvements, improved vscode support and pylance features built into the language server.

📚 [Documentation](https://detachhead.github.io/basedpyright) | 🛝 [Playground](http://basedpyright.com)

## why?

there are two main reasons for this fork:

1. pyright is lacking several features that are made exclusive to pylance, microsoft's closed-source vscode extension
2. the maintainer of pyright [closes valid issues for no reason and lashes out at users](https://github.com/microsoft/pyright/issues/8065#issuecomment-2146352290)

here is a (mostly) comprehensive list of the new features we've added to basedpyright:

### ability to pin the version used by vscode

in pyright, if the vscode extension gets updated, you may see errors in your project that don't appear in the CI, or vice-versa. see [this issue](https://github.com/microsoft/pylance-release/issues/5207).

basedpyright fixes this problem by adding an `importStrategy` option to the extension, which defaults to looking in your project for the [basedpyright pypi package](#published-as-a-pypi-package---no-nodejs-required).

### published as a pypi package - no nodejs required

pyright is only published as an npm package, which requires you to install nodejs. [the version on pypi](https://pypi.org/project/pyright/) is just an unofficial wrapper that installs node and the npm package the first time you invoke the cli, [which is quite flaky](https://github.com/RobertCraigie/pyright-python/issues/231).

python developers should not be expected to have to install nodejs in order to typecheck their python code. it should just be a regular pypi package like mypy, ruff, and pretty much all other python tooling. this is why basedpyright is [officially published on pypi](https://pypi.org/project/basedpyright/), which comes bundled with the npm package.

### new diagnostic rules

#### `reportUnreachable` - report errors on code that would otherwise be completely unchecked

pyright often incorrectly marks code as unreachable. in most cases, unreachable code is a mistake and therefore should be an error, but pyright does not have an option to report unreachable code. in fact, unreachable code is not even type-checked at all:

```py
if sys.platform == "win32":
  1 + "" # no error
```

by default, pyright will treat the body in the code above as unreachable if pyright itself was run on an operating system other than windows. this is bad of course, because chances are if you write such a check, you intend for your code to be executed on multiple platforms.

to make things worse, unreachable code is not even type-checked, so the obviously invalid `1 + ""` above will go completely unnoticed by the type checker.

basedpyright solves this issue with a `reportUnreachable` option, which will report an error on such unchecked code. in this example, you can [update your pyright config to specify more platforms using the `pythonPlatform` option](https://github.com/detachhead/basedpyright/blob/main/docs/configuration.md#main-configuration-options) if you intend for the code to be reachable.

#### `reportAny` - fully ban the `Any` type

pyright has a few options to ban "Unknown" types such as `reportUnknownVariableType`, `reportUnknownParameterType`, etc. but "Unknown" is not a real type, rather a distinction pyright uses used to represent `Any`s that come from untyped code or unfollowed imports. if you want to ban all kinds of `Any`, pyright has no way to do that:

```py
def foo(bar, baz: Any) -> Any:
    print(bar) # error: unknown type
    print(baz) # no error
```

basedpyright introduces the `reportAny` option, which will report an error on usages of anything typed as `Any`.

#### `reportIgnoreCommentWithoutRule` - enforce that all ignore comments specify an error code

it's good practice to specify an error code in your `pyright: ignore` comments:

```py
# pyright: ignore[reportUnreachable]
```

this way, if the error changes or a new error appears on the same line in the future, you'll get a new error because the comment doesn't account for the other error. unfortunately there are many rules in pyright that do not have error codes, so you can't always do this.

basedpyright resolves this by reporting those errors under the `reportGeneralTypeIssues` diagnostic rule. this isn't a perfect solution, but there were over 100 errors that didn't have diagnostic rules. i intend to split them into their own rules in the future, but this will do for now.

> [!WARNING]  
> `type: ignore` comments are unsafe and will soon be disabled by default (see [#330](https://github.com/DetachHead/basedpyright/issues/330) and [#55](https://github.com/DetachHead/basedpyright/issues/55)). we recommend using `pyright: ignore` comments instead.

#### `reportPrivateLocalImportUsage` - prevent implicit re-exports in local code

pyright's `reportPrivateImportUsage` rule only checks for private imports of third party modules inside `py.typed` packages. but there's no reason your own code shouldn't be subject to the same restrictions. to explicitly re-export something, give it a redundant alias [as described in the "Stub Files" section of PEP484](https://peps.python.org/pep-0484/#stub-files) (although it only mentions stub files, other type checkers like mypy have also extended this behavior to source files as well):

```py
# foo.py

from .some_module import a  # private import
from .some_module import b as b  # explicit re-export
```

```py
# bar.py

# reportPrivateLocalImportUsage error, because `a` is not explicitly re-exported by the `foo` module:
from foo import a

# no error, because `b` is explicitly re-exported:
from foo import b
```

#### `reportImplicitRelativeImport` - reporting errors on invalid "relative" imports

pyright allows invalid imports such as this:
```py
# ./module_name/foo.py:
```
```py
# ./module_name/bar.py:
import foo # wrong! should be `import module_name.foo` or `from module_name import foo`
```

this may look correct at first glance, and will work when running `bar.py` directly as a script, but when it's imported as a module, it will crash:
```py
# ./main.py:
import module_name.bar  # ModuleNotFoundError: No module named 'foo'
```

the new `reportImplicitRelativeImport` rule bans imports like this. if you want to do a relative import, the correct way to do it is by importing it from `.` (the current package):
```py
# ./module_name/bar.py:
from . import foo
```

#### `reportInvalidCast` - prevent non-overlapping `cast`s

most of the time when casting, you want to either cast to a narrower or wider type:

```py
foo: int | None
cast(int, foo) #  narrower type
cast(object, foo) #  wider type
```

but pyright doesn't prevent casts to a type that doesn't overlap with the original:

```py
foo: int
cast(str, foo)
```

in this example, it's impossible to be `foo` to be a `str` if it's also an `int`, because the `int` and `str` types do not overlap. the `reportInvalidCast` rule will report invalid casts like these.

##### note about casting with `TypedDict`s

a common use case of `cast` is to convert a regular `dict` into a `TypedDict`:

```py
foo: dict[str, int | str]
bar = cast(dict[{"foo": int, "bar": str}], foo)
```

unfortunately, this will cause a `reportInvalidCast` error when this rule is enabled, because although at runtime `TypedDict` is a `dict`, type checkers treat it as an unrelated subtype of `Mapping` that doesn't have a `clear` method, which would break its type-safety if it were to be called on a `TypedDict`.

this means that although casting between them is a common use case, `TypedDict`s and `dict`s technically do not overlap.

#### `reportUnsafeMultipleInheritance` - ban inheriting from multiple different base classes with constructors

multiple inheritance in python is awful:

```py
class Foo:
    def __init__(self):
        super().__init__()
class Bar:
    def __init__(self):
        ...

class Baz(Foo, Bar):
    ...

Baz()
```
in this example, `Baz()` calls `Foo.__init__`, and the `super().__init__()` in `Foo` now calls to `Bar.__init__` even though `Foo` does not extend `Bar`.

this is complete nonsense and very unsafe, because there's no way to statically know what the super class will be.

pyright has the `reportMissingSuperCall` rule which, for this reason, complains even when your class doesn't have a base class. but that sucks because there's no way to know what arguments the unknown `__init__` takes, which means even if you do add a call to `super().__init__()` you have no clue what arguments it may take. so this rule is super annoying when it's enabled, and has very little benefit because it barely makes a difference in terms of safety.

`reportUnsafeMultipleInheritance` bans multiple inheritance when there are multiple base classes with an `__init__` or `__new__` method, as there's no way to guarantee that all of them will get called with the correct arguments (or at all). this allows `reportMissingSuperCall` to be more lenient. ie. when `reportUnsafeMultipleInheritance` is enabled, missing `super()` calls will only be reported on classes that actually have a base class.

### re-implementing pylance-exclusive features

basedpyright re-implements some of the features that microsoft made exclusive to pylance, which is microsoft's closed-source vscode extension built on top of the pyright language server with some additional exclusive functionality ([see the pylance FAQ for more information](https://github.com/microsoft/pylance-release/blob/main/FAQ.md#what-features-are-in-pylance-but-not-in-pyright-what-is-the-difference-exactly)).

the following features have been re-implemented in basedpyright's language server, meaning they are no longer exclusive to vscode. you can use any editor that supports the [language server protocol](https://microsoft.github.io/language-server-protocol/). for more information on installing pyright in your editor of choice, see [the installation instructions](https://detachhead.github.io/basedpyright/#/installation).

#### import suggestion code actions
pyright only supports import suggestions as autocomplete suggestions, but not as quick fixes (see [this issue](https://github.com/microsoft/pyright/issues/4263#issuecomment-1333987645)).

basedpyright re-implements pylance's import suggestion code actions:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/a3e8a506-5682-4230-a43c-e815c84889c0)

#### semantic highlighting

|before|after|
|-|-|
|![image](https://github.com/DetachHead/basedpyright/assets/57028336/f2977463-b828-470e-8094-ca437a312350)|![image](https://github.com/DetachHead/basedpyright/assets/57028336/e2c7999e-28c0-4a4c-b975-f63575ec3404)|

basedpyright re-implements pylance's semantic highlighting along with some additional improvements:

- variables marked as `Final` have the correct "read-only" colour
- supports [the new `type` keyword in python 3.12](https://peps.python.org/pep-0695/)
- `Final` variables are coloured as read-only

initial implementation of the semantic highlighting provider was adapted from the [pyright-inlay-hints](https://github.com/jbradaric/pyright-inlay-hints) project.

#### inlay hints

![image](https://github.com/DetachHead/basedpyright/assets/57028336/41ed93e8-04e2-4163-a1be-c9ec8f3d90df)

basedpyright contains several improvements and bug fixes to the original implementation adapted from [pyright-inlay-hints](https://github.com/jbradaric/pyright-inlay-hints).

#### docstrings for compiled builtin modules

many of the builtin modules are written in c, meaning the pyright language server cannot statically inspect and display their docstrings to the user. unfortunately they are also not available in the `.pyi` stubs for these modules, as [the typeshed maintainers consider it to be too much of a maintanance nightmare](https://github.com/python/typeshed/issues/4881#issuecomment-1275775973).

pylance works around this problem by running a "docstring scraper" script on the user's machine, which imports compiled builtin modules, scrapes all the docstrings from them at runtime, then saves them so that the language server can read them. however this isn't ideal for a few reasons:

- only docstrings for modules and functions available on the user's current OS and python version will be generated. so if you're working on a cross-platform project, or code that's intended to be run on multiple versions of python, you won't be able to see docstrings for compiled builtin modules that are not available in your current python installation.
- it's (probably) slower because these docstrings need to be scraped either when the user launches vscode, or when the user hovers over a builtin class/function (disclaimer: i don't actually know when it runs, because pylance is closed source)

in basedpyright's implementation, the docstrings for all compiled builtin modules for all currently supported python versions and all platforms (macos, windows and linux) are bundled in the default typeshed stubs that come with the basedpyright package.

##### examples

here's a demo of basedpyright's builtin docstrings when running on windows, compared to pylance:

###### basedpyright

![](https://github.com/DetachHead/basedpyright/assets/57028336/df4f4916-4b5e-4367-bd88-4ddadf283780)

###### pylance

![](https://github.com/DetachHead/basedpyright/assets/57028336/15a38478-8405-419c-a6e1-3c0801808896)

##### generating your own stubs with docstrings

basedpyright uses [docify](https://github.com/AThePeanut4/docify) to add docstrings to its stubs. if you have third party compiled modules and you want basedpyright to see its docstrings, you can do the same:

```
python -m docify path/to/stubs/for/package --in-place
```

or if you're using a different version of typeshed, you can use the `--builtins-only` argument to replicate how basedpyright's version of typeshed is generated for your current platform and python version:

```
python -m docify path/to/typeshed/stdlib --builtins-only --in-place
```

### errors on invalid configuration

in pyright, if you have any invalid config, it may or may not print a warning to the console, then it will continue type-checking and the exit code will be 0 as long as there were no type errors:

```toml
[tool.pyright]
mode = "strict"  # wrong! the setting you're looking for is called `typeCheckingMode`
```

in this example, it's very easy for errors to go undetected because you thought you were on strict mode, but in reality pyright just ignored the setting and silently continued type-checking on "basic" mode.

to solve this problem, basedpyright will exit with code 3 on any invalid config.

### fixes for the `reportRedeclaration` and `reportDuplicateImport` rules

pyright does not report redeclarations if the redeclaration has the same type:
```py
foo: int = 1
foo: int = 2  # no error
```
nor does it care if you have a duplicated import in multiple different `import` statements, or in aliases:
```py
from foo import bar
from bar import bar  # no error
from baz import foo as baz, bar as baz  # no error
```

basedpyright solves both of these problems by always reporting an error on a redeclaration or an import with the same name as an existing import.

### better defaults
we believe that type checkers and linters should be as strict as possible by default, making the user aware of all the available rules so they can more easily make informed decisions about which rules they don't want enabled in their project. that's why the following defaults have been changed in basedpyright

#### `typeCheckingMode`
used to be `basic`, but now defaults to `all`. in the future we intend to add [baseline](https://kotlinisland.github.io/basedmypy/baseline.html) to allow for easy adoption of more strict rules in existing codebases.

#### `pythonPlatform`
used to assume that the operating system pyright is being run on is the only operating system your code will run on, which is rarely the case. in basedpyright, `pythonPlatform` defaults to `All`, which assumes your code can run on any operating system.

### inline `TypedDict` support

pyright used to support defining `TypedDict`s inline, like so:

```py
foo: dict[{"foo": int, "bar": str}] = {"foo": "a", "bar": 1}
```

this was an experimental feature and was removed because it never made it into a PEP. but this functionality is very convenient and we see no reason not to continue supporting it, so we added it back in basedpyright.

currently this can be disabled by setting `enableExperimentalFeatures` to `false`. in the future there will be a separate `enableNonStandardFeatures` option once we [add more "based" features](#basedmypy-feature-parity).

### improved integration with CI platforms

regular pyright has third party integrations for github actions and gitlab, but they are difficult to install/set up. these integrations are built into basedpyright, which makes them much easier to use.

#### github actions

basedpyright automatically detects when it's running in a github action, and modifies its output to use [github workflow commands](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions). this means errors will be displayed on the affected lines of code in your pull requests automatically:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/cc820085-73c2-41f8-ab0b-0333b97e2fea)

this is an improvement to regular pyright, which requires you to use a [third party action](https://github.com/jakebailey/pyright-action) that [requires boilerplate to get working](https://github.com/jakebailey/pyright-action?tab=readme-ov-file#use-with-a-virtualenv). basedpyright just does it automatically without you having to do anything special:

```yaml
# .github/workflows/your_workflow.yaml

jobs:
  check:
    steps:
      - run: ...  # checkout repo, install dependencies, etc
      - run: basedpyright  # no additional arguments required. it automatically detects if it's running in a github action 
```

#### gitlab code quality reports

the `--gitlabcodequality` argument will output a [gitlab code quality report](https://docs.gitlab.com/ee/ci/testing/code_quality.html) which shows up on merge requests:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/407f0e61-15f2-4d04-b235-1946d49fd180)

to enable this in your gitlab CI, just specify a file path to output the report to, and in the `artifacts.reports.codequality` section of your `.gitlab-ci.yml` file:

```yaml
basedpyright:
  script: basedpyright --gitlabcodequality report.json
  artifacts:
    reports:
      codequality: report.json
```

## basedmypy feature parity

[basedmypy](https://github.com/kotlinisland/basedmypy) is a fork of mypy with a similar goal in mind: to fix some of the serious problems in mypy that do not seem to be a priority for the maintainers. it also adds many new features which may not be standardized but greatly improve the developer experience when working with python's far-from-perfect type system.

we aim to [port most of basedmypy's features to basedpyright](https://github.com/DetachHead/basedpyright/issues?q=is%3Aissue+is%3Aopen+label%3A%22basedmypy+feature+parity%22), however as mentioned above our priority is to first fix the critical problems with pyright.

note that any non-standard features we add will be optional, as we intend to support library developmers who can't control what type checker their library is used with.

# pypi package

basedpyright differs from pyright by publishing the command line tool as a [pypi package](https://pypi.org/project/basedpyright/) instead of an npm package. this makes it far more convenient for python developers to use, since there's no need to install any additional tools.

for more information, see the [installation instructions](https://detachhead.github.io/basedpyright/#/installation?id=command-line).

# vscode extension

## install

install the extension from [the vscode extension marketplace](https://marketplace.visualstudio.com/items?itemName=detachhead.basedpyright) or [the open VSX registry](https://open-vsx.org/extension/detachhead/basedpyright)

## usage

the basedpyright vscode extension will automatically look for the pypi package in your python environment.

if you're adding basedpyright as a development dependency in your project, we recommend adding it to the recommended extensions list in your workspace to prompt others working on your repo to install it:

```jsonc
// .vscode/extensions.json

{
  "recommendations": ["detachhead.basedpyright"]
}
```

in `.vscode/settings.json`, remove any settings starting with `python.analysis`, as they are not used by basedpyright. you should instead set these settings using the `tool.basedpyright` (or `tool.pyright`) section in `pyroject.toml` ([see below](#pyprojecttoml))

you should also disable the built in language server support from the python extension, as it conflicts with basedpyright's language server. the basedpyright extension will detect this problem and suggest fixing it automatically.

<!-- if changing this section title, make sure you also change the url in the pylance notification in the vscode extension -->
## using basedpyright with pylance (not recommended)

unless you depend on any pylance-exclusive features that haven't yet been re-implemented in basedpyright, it's recommended to disable/uninstall the pylance extension.

if you do want to continue using pylance, all of the options and commands in basedpyright have been renamed to avoid any conflicts with the pylance extension, and the restriction that prevents both extensions from being enabled at the same time has been removed. for an optimal experience you should change the following settings in your `.vscode/settings.json` file:

- disable pylance's type-checking by setting `"python.analysis.typeCheckingMode"` to `"off"`. this will prevent pylance from displaying duplicated errors from its bundled pyright version alongside the errors already displayed by the basedpyright extension.
- disable basedpyright's LSP features by setting `"basedpyright.disableLanguageServices"` to `true`. this will prevent duplicated hover text and other potential issues with pylance's LSP. keep in mind that this may result in some inconsistent behavior since pylance uses its own version of the pyright LSP.

```json
{
    "python.analysis.typeCheckingMode": "off",
    "basedpyright.disableLanguageServices": true
}
```
*(the basedpyright extension will detect this problem and suggest fixing it automatically)*

# playground

you can try basedpyright in your browser using the [basedpyright playground](http://basedpyright.com)

# pre-commit hook

integration with [pre-commit](https://pre-commit.com) is also supported.

```yaml
# .pre-commit-config.yaml

repos:
  - repo: https://github.com/DetachHead/basedpyright-pre-commit-mirror
    rev: v1.13.0  # or whatever the latest version is at the time
    hooks:
    - id: basedpyright
```

for more information, see the documentation [here](https://github.com/DetachHead/basedpyright-pre-commit-mirror/blob/main/README.md)

# recommended setup

it's recommended to use both the basedpyright cli and vscode extension in your project. the vscode extension is for local development and the cli is for your CI.

below are the changes i recommend making to your project when adopting basedpyright

## `pyproject.toml`

we recommend using [pdm with pyprojectx](https://pdm-project.org/latest/#other-installation-methods) (click the "inside project" tab) to manage your dependencies.

```toml
[tool.pyprojectx]
main = ["pdm==2.12.4"]  # installs pdm to your project instead of globally

[tool.pdm.dev-dependencies]  # or the poetry equivalent
dev = [
    "basedpyright", # you can pin the version here if you want, or just rely on the lockfile
]

[tool.basedpyright]
# many settings are not enabled even in strict mode, which is why basedpyright includes an "all" option
# you can then decide which rules you want to disable
typeCheckingMode = "all"
```

pinning your dependencies is important because it allows your CI builds to be reproducible (ie. two runs on the same commit will always produce the same result). basedpyright ensures that the version of pyright used by vscode always matches this pinned version.
