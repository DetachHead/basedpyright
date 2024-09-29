# baseline (beta)
have you ever wanted to adopt a new tool or enable new checks in an existing project, only to be immediately bombarded with thousands of errors you'd have to fix? baseline solves this problem by allowing you to only report errors on new or modified code. it works by generating a baseline file keeping track of the existing errors in your project so that only errors in newly written or modified code get reported.

to enable baseline, run `basedpyright --writebaseline` in your terminal or run the _"basedpyright: Write new errors to baseline"_ task in vscode. this will generate a `./basedpyright/baseline.json` for your project. you should commit this file so others working on your project can benefit from it too.

this file gets automatically updated as errors are removed over time in both the CLI and the language server. if you ever need to baseline new errors or an error that resurfaced because you've modified the same line of code it was on, just run that command again.

## how does it work?

each baselined error is stored and matched by the following details:

-   the path of the file it's in (relative to the project root)
-   its diagnostic rule name (eg. `reportGeneralTypeIssues`)
-   the position of the error in the file (column only, which prevents errors from resurfacing when you add or remove lines in a file)

no baseline matching strategy is perfect, so this is subject to change. baseline is in beta so if you have any feedback please [raise an issue](https://github.com/DetachHead/basedpyright/issues/new/choose).

## how is this different to `# pyright: ignore` comments?

ignore comments are typically used to suppress a false positive or workaround some limitation in the type checker. baselining is a way to suppress many valid instances of an error across your whole project, to avoid the burden of having to update thousands of lines of old code just to adopt stricter checks on your new code.

## credit

this is heavily inspired by [basedmypy](https://kotlinisland.github.io/basedmypy/baseline).