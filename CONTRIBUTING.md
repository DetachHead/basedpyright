# Contributing


## issues

unlike the upstream pyright repo, we are very open to ideas for improvements and bug reports. if you've raised an issue on the upstream pyright repo that was closed without a solution, feel free to raise it again here.

please upvote issues you find important using the 👍 react. we don't close issues that don't get enough upvotes or anything like that. this is just to help us prioritize which issues to address first.

## local development

although pyright is written in typescript, we've made improvements to the developer experience for python developers who are not familiar with typescript/nodejs. you should be able to work on basedpyright without ever having to install nodejs yourself. the node installation is instead managed by a [pypi package](https://pypi.org/project/nodejs-wheel/) and installed to the project's virtualenv. the only thing you need to have installed already is python (any version from 3.8 to 3.12 should work)

we recommend using vscode, as there are project configuration files in the repo that set everything up correctly (linters/formatters/debug configs, etc).

1. hit `F1` > `Tasks: Run task` > `install dependencies`, or run the following command:
   ```
   ./pw pdm install
   ```
   this will install all dependencies required for the project (pyprojectx, pdm, node, typescript, etc.). all dependencies are installed locally to `./.venv` and `./node_modules` 
2. press "Yes" when prompted by vscode to use the newly created virtualenv

you can now run any node/npm commands from inside the venv.
