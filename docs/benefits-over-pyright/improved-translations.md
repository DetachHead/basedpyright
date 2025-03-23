# localization fixes

## improved translations

the translations in pyright come from microsoft's localization team, who are not programmers. not only does this result in poor quality translations, but microsoft also doesn't accept contributions to fix them ([more info here](https://github.com/microsoft/pyright/issues/7441#issuecomment-1987027067)).

we accept translation fixes in basedpyright. [see the localization guidelines](../development/localization.md) for information on how to contribute.

## fixed country code format for linux

in pyright, you can configure the locale using [environment variables](../configuration/config-files.md#locale-configuration) in `"en-US"` format. this format is commonly used on windows, but linux uses the `"en_US"` format instead. unlike pyright, basedpyright supports both formats.
