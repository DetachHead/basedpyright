# baseline

have you ever wanted to adopt a new tool or enable new checks in an existing project, only to be immediately bombarded with thousands of errors you'd have to fix? baseline solves this problem by allowing you to only report errors on new or modified code. it works by generating a baseline file keeping track of the existing errors in your project so that only errors in newly written or modified code get reported.

to enable baseline, run `basedpyright --writebaseline` in your terminal or run the _"basedpyright: Write new errors to baseline"_ task in your editor. this will generate a baseline file at `./.basedpyright/baseline.json` in your project. you should commit this file so others working on your project can benefit from it too.

you can customize the baseline file path [using the `baselineFile` setting](../configuration/config-files.md#baselineFile) or [using the `--baselinefile` CLI argument](../configuration/command-line.md#command-line).

## how often do i need to update the baseline file?

by default, this file gets automatically updated as errors are removed over time in both the CLI and the language server. you should only manually run the write baseline command in the following scenarios:

-   a baselined error incorrectly resurfaces when updating unrelated code
-   you're enabling a new diagnostic rule and want to baseline all the new errors it reported

if you need to suppress a diagnostic for another reason, consider using [a `# pyright: ignore` comment](../configuration/comments.md#prefer-pyrightignore-comments) instead.

## disabling automatic updates for baselined error removals

if you want more control over when the baseline file is updated, use the `baselineMode` setting in either the [language server](../configuration/language-server-settings.md) or [the CLI](../configuration/command-line.md#option-2-baselinemode-experimental). for example, using the `discard` mode will prevent the baseline file from being automatically updated when baselined errors are removed.

!!! tip

    if you disable automatic baseline updates in the language server, a potential alternative workflow for still having the baseline file updated with removed errors is to set up a [prek hook](../installation/prek-hook.md) in your project to run the basedpyright CLI. this would take care of error removals at commit time instead of during editor saves.

## how does it work?

each baselined error is stored and matched by the following details:

-   the path of the file it's in (relative to the project root)
-   its diagnostic rule name (eg. `reportGeneralTypeIssues`)
-   the position of the error in the file (column only, which prevents errors from resurfacing when you add or remove lines in a file)

no baseline matching strategy is perfect, so sometimes old errors can resurface when you're moving code around. if that happens, you can explicitly regenerate the baseline file by running the _"basedpyright: Write new errors to baseline"_ command in your editor or [via the command line](https://docs.basedpyright.com/latest/configuration/command-line/#regenerating-the-baseline-file)

## how is this different to `# pyright: ignore` comments?

ignore comments are typically used to suppress a false positive or workaround some limitation in the type checker. baselining is a way to suppress many valid instances of an error across your whole project, to avoid the burden of having to update thousands of lines of old code just to adopt stricter checks on your new code.

## credit

this is heavily inspired by [basedmypy](https://kotlinisland.github.io/basedmypy/baseline).
