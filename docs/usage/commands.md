# Language Server Commands

basedyright offers the following language server commands, which can be invoked from, for example, VS Code’s “Command Palette”, which can be accessed from the View menu or by pressing Cmd-Shift-P.

## Organize Imports
This command reorders all imports found in the global (module-level) scope of the source file. As recommended in PEP8, imports are grouped into three groups, each separated by an empty line. The first group includes all built-in modules, the second group includes all third-party modules, and the third group includes all local modules.

Within each group, imports are sorted alphabetically. And within each “from X import Y” statement, the imported symbols are sorted alphabetically. Pyright also rewraps any imports that don't fit within a single line, switching to multi-line formatting.

!!! note

    we recommend using [ruff](https://docs.astral.sh/ruff/formatter/#sorting-imports) to organize your imports instead, because pyright does not provide a way to validate that imports are sorted via the CLI.

## Restart Server
This command forces the type checker to discard all of its cached type information and restart analysis. It is useful in cases where new type stubs or libraries have been installed.


## Write new errors to baseline

writes any new errors to the [baseline](../benefits-over-pyright/baseline.md) file. the language server will automatically update it on-save if errors are removed from a file and no new errors were added. for more information about when to use this command, [see here](../benefits-over-pyright/baseline.md#how-often-do-i-need-to-update-the-baseline-file).