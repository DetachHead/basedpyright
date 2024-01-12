# Basedmypy Changelog

## [Unreleased]
### Added
- `Callable` syntax (`(int) -> str`) (#619)
- `FunctionType` syntax (`def (int) -> str`) (#619)
### Fixes
- `Callable` is no longer `types.FunctionType` (#619)

## [2.4.0]

## [2.3.0]
### Added
- f-string format specs are checked (#543)
- Narrow type on initial assignment (#547)
- Annotations in function bodies are not analyzed as evaluated (#564)
- Invalid `cast`s show an error (#573)
- Argument names are validated for subtypes (#562)
- Type-guards narrow in the negative (#553)
- Conditional types for asymmetric type-guards (#553)
- Static conditions report an error (#553)
- Regex groups are special-cased (#531)
- f-strings will show an error if the value doesn't define a stringification (#565)
### Enhancements
- Show 'narrowed from' in `reveal_type` (#550)
- `--color-output` is enabled by default (#531)
- `--ide` will disable color-output (#531)
- Output lines won't wrap if not connected to a terminal (#531)
### Fixes
- Render star args in error messages properly (#551)
- The first argument to `cast` is analyzed as evaluated (#564)
- Decorated functions that return `None` correctly warn when used (#572)
- Some impossible type-guards were not reporting an error (#553)

## [2.2.1]
### Fixes
- explicit-override is re-enabled by default

## [2.2.0]
### Added
- type-guards have been reworked from the ground up (#516)
- `TypeGuard` is retained in inferred types (#504)
- Type narrowing is applied from lambda execution (#504)
- `--ide` flag (#501)
### Enhancements
- `show-error-context`/`pretty` are now on by default (#501)
- Show fake column number when `--show-error-end` (#501)
- Error messages point to basedmypy docs (#516)
- `Callable` types in error messages don't contain `mypy_extensions` (#516)
### Fixes
- Don't show "X defined here" when error context is hidden (#498)
- Fix issue with reveal code in ignore message (#490)
- Fixed union at join for same `type` literals. (#488)
- Don't report false `Any` expressions when inferring lambda type (#515)
- Correctly match overload when it contains an `Any` expression (#515)
- Fixed the variance of `Mapping`s key type (#527)

## [2.1.0]

## [2.0.0]
### Added
- Deprecate python 3.7 support (#457)
- Allow denotation of tuple types with tuple literals (#458)
- Removed `--legacy` flag in favour of `--no-strict` (#445)
- `default-return` is now enabled by default (#445)
### Enhancements
- Removed `Any` from the typings for `re.Match` group functions. (#459)
- Ignore `Any` from unused `__init__`. (#321)
### Fixes
- Fix unsafe variance note (#452)
- Fix crash with baseline filtering (#471)

## [1.8.0]
### Added
- `Intersection` type (#357)

## [1.7.0]
### Added
- `ignore-missing-py-typed` to use types even if there is no `py.typed` (#337)
### Fixes
- Errors regarding inferred functions didn't have a note (#394)
- Type ignored calls to incomplete functions left a phantom note (#395)
- Fix incorrect plural in summary message (#386)
### Enhancements
- Baseline now stores the source code for better matching (#415)
- Duplicates are no longer stored in the baseline (#231)

## [1.6.0]
### Added
- Support using `TypeVar`s in the bounds of other `TypeVar`s
### Enhancements
- Similar errors on the same line will now not be removed
- Render generic upper bound with `: ` instead of ` <: `
- Render uninhabited type as `Never` instead of `<nothing>`
- Render Callables with `-> None`
### Fixes
- Handle positional only `/` parameters in overload implementation inference
- Render inferred literal without `?`
- Fix infer from defaults for inner functions

## [1.5.0]
### Added
- Allow literal `int`, `bool` and `Enum`s without `Literal`
### Enhancements
- Unionize at type joins instead of common ancestor
- Render Literal types better in output messages

## [1.4.0]
### Added
- `ignore_any_from_errors` option to suppress `no-any-expr` messages from other errors
- Function types are inferred from Overloads, overrides and default values. (no overrides for now sorry)
- Infer Property types
- Calls to incomplete functions are an error (configurable with `incomplete_is_typed`)
- Added a new type `Untyped`, it's like `Any`, but more specific
- Added a dependency on `basedtyping`
### Enhancements
- Render types a lot better in output messages
### Fixes
- `types.NoneType` now works as a value of `type[None]`

## [1.3.0]
### Added
- `default_return` option to imply unannotated return type as `None`.
- Specific error codes for `Any` errors
- Automatic baseline mode, if there are no new errors then write.
- Ignore baseline with `mypy --baseline-file= src`
### Enhancements
- Baseline will ignore reveals (`reveal_type` and `reveal_locals`).
- `--write-baseline` will report total and new errors.
- Much better baseline matching.

## [1.2.0]
### Added
- Unions in output messages show with new syntax
- `--legacy` flag
- new baseline format

## [1.0.0]
### Added
- Strict by default(`--strict` and disable dynamic typing)
- add baseline support(`--write-baseline`, `--baseline-file`)
- Type ignore must specify error code
- Unused type ignore can be ignored
- Add error code for unsafe variance(`unsafe-variance`)
