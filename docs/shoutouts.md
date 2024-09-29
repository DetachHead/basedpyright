# Shoutouts

some projects that helped make basedpyright possible

## [basedmypy](https://github.com/kotlinisland/basedmypy)

basedmypy is a fork of mypy with a similar goal in mind: to fix some of the serious problems in mypy that do not seem to be a priority for the maintainers. it also adds many new features which may not be standardized but greatly improve the developer experience when working with python's far-from-perfect type system.

basedmypy heavily inspired me to create basedpyright. while the two projects have similar goals, there are some differences:

-   basedmypy makes breaking changes to improve the typing system and its syntax. for example, it supports intersections, `(int) -> str` function type syntax and `foo is int` syntax for type guards. [more info here](https://kotlinisland.github.io/basedmypy/based_features.html)
-   basedpyright intends to be fully backwards compatible with all standard typing functionality. non-standard features will be fully optional and can be disabled, as we intend to support library developers who can't control what type checker their library is used with.
-   basedpyright's two main goals are to improve the type checker's accuracy and reliability with existing syntax, and to bridge the gap between pylance and pyright

## [pyright-inlay-hints](https://github.com/jbradaric/pyright-inlay-hints)

one of the first pylance features we added was inlay hints and semantic highlighting. i had no clue where to begin until i found this project which had already done the bulk of the work which i was able to expand upon

## [docify](https://github.com/AThePeanut4/docify)

used for [our builtin docstrings support](./benefits-over-pyright/pylance-features.md#docstrings-for-compiled-builtin-modules)

## [nodejs-wheel](https://github.com/njzjz/nodejs-wheel)

this project made the basedpyright pypi package possible, which significantly simplified the process of installing pyright for python developers who aren't familiar with nodejs and npm. since we started using it in basedpyright, it has since been adopted by [the unofficial pyright pypi package](https://github.com/RobertCraigie/pyright-python/issues/231#issuecomment-2366599865) as well.

## [pyprojectx](https://github.com/pyprojectx/pyprojectx)

this tool makes working on multiple different python projects so much less stressful. instead of installing all these project management tools like pdm, uv, etc. globally you can install and pin them inside your project without ever having to install anything first.
