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
    this will install all dependencies required for the project (pyprojectx, pdm, node, typescript, etc.). all dependencies are installed locally to `./.venv` and `./node_modules`
2. press "Yes" when prompted by vscode to use the newly created virtualenv

you can now run any node/npm commands from inside the venv.

## Debugging

To debug pyright, open the root source directory within VS Code. Open the debug sub-panel and choose “Pyright CLI” from the debug target menu. Click on the green “run” icon or press F5 to build and launch the command-line version in the VS Code debugger. There's also a similar option that provides a slightly faster build/debug loop: make sure you've built the pyright-internal project e.g. with Terminal > Run Build Task > tsc: watch, then choose “Pyright CLI (pyright-internal)”.

To debug the VS Code extension, select “Pyright extension” from the debug target menu. Click on the green “run” icon or press F5 to build and launch a second copy of VS Code with the extension. Within the second VS Code instance, open a python source file so the pyright extension is loaded. Return to the first instance of VS Code and select “Pyright extension attach server” from the debug target menu and click the green “run” icon. This will attach the debugger to the process that hosts the type checker. You can now set breakpoints, etc.

To debug the VS Code extension in watch mode, you can do the above, but select “Pyright extension (watch mode)”. When pyright's source is saved, an incremental build will occur, and you can either reload the second VS Code window or relaunch it to start using the updated code. Note that the watcher stays open when debugging stops, so you may need to stop it (or close VS Code) if you want to perform packaging steps without the output potentially being overwritten.
