<h1><img src="img/readme_logo.png"> basedpyright</h1>

--8<-- "README.md:header"

🛝 [Playground](http://basedpyright.com)

<div class="grid cards" markdown>

-   :material-microsoft-visual-studio-code:{ .lg .middle } **Pylance features in any editor**

    ***

    basedpyright re-implements many features exclusive to pylance - microsoft's closed-source extension that can't be used outside of vscode.

    [:octicons-arrow-right-24: more info](./benefits-over-pyright/pylance-features.md)

-   :simple-pypi:{ .lg .middle } **Easy to install & pin**

    ***

    unlike pyright, basedpyright can be installed from PyPI without having to install NodeJS. the VSCode extension uses the same version so you never see different errors in your editor vs. the CLI

    [:octicons-arrow-right-24: more info](./benefits-over-pyright/pypi-package-vscode-pinning.md)

-   :octicons-alert-16:{ .lg .middle } **Strict by default & new type checking rules**

    ***

    basedpyright introduces many new diagnostic rules to detect potentially serious issues in your code that pyright won't catch, and [all rules are enabled by default](./benefits-over-pyright/better-defaults.md) for maximum discoverability.

    [:octicons-arrow-right-24: more info](./benefits-over-pyright/new-diagnostic-rules.md)

-   :octicons-checklist-16:{ .lg .middle } **Baseline support**

    ***

    adopt basedpyright's stricter type checking rules effortlessly in an existing project. no need to update any of your old code

    [:octicons-arrow-right-24: more info](./benefits-over-pyright/baseline.md)

-   :octicons-sync-16:{ .lg .middle } **Up-to-date**

    ***

    when a new version of pyright is released, we merge it and release a new version of basedpyright within a day

    [:octicons-arrow-right-24: more info](./development/upstream.md)

-   :octicons-issue-reopened-16:{ .lg .middle } **Open to feedback**

    ***

    we listen to user feedback. if you encounter any problems or have an idea for a new feature, don't hesitate to open an issue.

    [:octicons-arrow-right-24: issue tracker](https://github.com/DetachHead/basedpyright/issues)

</div>

see the [Benefits over Pyright](./benefits-over-pyright/new-diagnostic-rules.md) section for a comprehensive list of new features and improvements we've made to pyright.
