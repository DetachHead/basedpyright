# Contributing

## Github Issues

unlike the upstream pyright repo, we are very open to ideas for improvements and bug reports. if you've raised an issue on the upstream pyright repo that was closed without a solution, feel free to [raise it again here](https://github.com/DetachHead/basedpyright/issues/new).

please upvote issues you find important using the 👍 react. we don't close issues that don't get enough upvotes or anything like that. this is just to help us prioritize which issues to address first.

## Building

although pyright is written in typescript, in basedpyright we've made improvements to the developer experience for python developers who are not familiar with typescript/nodejs. you should be able to work on basedpyright without ever having to install nodejs yourself. the node installation is instead managed by a [pypi package](https://pypi.org/project/nodejs-wheel/) and installed to the project's virtualenv. the only thing you need to have installed already is python (any version from 3.9 to 3.13 should work)

we recommend using vscode, as there are project configuration files in the repo that set everything up correctly (linters/formatters/debug configs, etc).

1. hit `F1` > `Tasks: Run task` > `install dependencies`, or run the following command:
    ```
    ./pw uv sync
    ```
    this will install all dependencies required for the project (pyprojectx, uv, node, typescript, etc.). all dependencies are installed locally to `./.venv` and `./node_modules`
2. press "Yes" when prompted by vscode to use the newly created virtualenv

you can now run any node/npm commands from inside the venv.

## Debugging

!!! note

    these instructions assume you are using VSCode/VSCodium. if you are using another editor, npm tasks can be run via the command line with `npm run script-name`. you can view all the available scripts in the root `./package.json`, but VSCode-specific debug configs will be unavailable.

### CLI

To debug pyright, open the root source directory within VS Code. Open the debug sub-panel and choose “Pyright CLI” from the debug target menu. Click on the green “run” icon or press F5 to build and launch the command-line version in the VS Code debugger. There's also a similar option that provides a slightly faster build/debug loop: make sure you've built the pyright-internal project e.g. with Terminal > Run Build Task > tsc: watch, then choose “Pyright CLI (pyright-internal)”.

### VSCode extension

To debug the VS Code extension, select “Pyright extension” from the debug target menu. Click on the green “run” icon or press F5 to build and launch a second copy of VS Code with the extension. Within the second VS Code instance, open a python source file so the pyright extension is loaded. Return to the first instance of VS Code and select “Pyright extension attach server” from the debug target menu and click the green “run” icon. This will attach the debugger to the process that hosts the type checker. You can now set breakpoints, etc.

To debug the VS Code extension in watch mode, you can do the above, but select “Pyright extension (watch mode)”. When pyright's source is saved, an incremental build will occur, and you can either reload the second VS Code window or relaunch it to start using the updated code. Note that the watcher stays open when debugging stops, so you may need to stop it (or close VS Code) if you want to perform packaging steps without the output potentially being overwritten.

!!! tip "inspecting LSP messages"

    while the VSCode extension is running in this mode, you can run the `npm: lsp-inspect` task to launch the [LSP inspector](https://lsp-devtools.readthedocs.io/en/latest/lsp-devtools/guide/inspect-command.html), which allows you to browse all messages sent between the client and server:

    ![](./lspinspector.svg)

    note that this does not work on windows, see [this issue](https://github.com/swyddfa/lsp-devtools/issues/125). as a workaround you can use [the client](#language-server) instead.

### Language server

you may want to debug the language server without the VSCcode extension, which can be useful when investigating issues that only seem to occur in other editors. you can do this using [LSP-inspector](https://github.com/swyddfa/lsp-devtools)'s client by running the `npm: lsp-client` task or the "LSP client" launch config

!!! note "for windows users"

    the npm script will not work if run from VSCode's task runner. use the launch config instead.
