# Environment variables

## Locale Configuration

Pyright provides diagnostic messages that are translated to multiple languages, which are improved in basedpyright thanks to [community-contributed translations](../development/localization.md). By default, basedpyright uses the default locale of the operating system. You can override the desired locale through the use of one of the following environment variables, listed in priority order.

```
LC_ALL="de"
LC_MESSAGES="en-us"
LANG="zh_CN"
LANGUAGE="fr"
```

The locale specifiers can be `xx-xx` or `xx_XX` in basedpyright. The latter form is used in unix-like platforms, which is not supported in pyright.

When running in VS Code, the editor's locale takes precedence. Setting these environment variables applies only when using pyright outside of VS Code.

## Temporary Directories

If Pyright fails to create a temporary directory (for example in remote/server environments where the OS temp directory doesn't exist or isn't writable), you can override the temp directory root:

-   `PYRIGHT_TMPDIR`: Absolute path to a directory that Pyright can use for temporary files/directories. Pyright will create it if needed.

Pyright otherwise relies on the platform temp directory (for example `TMPDIR`, `TMP`, `TEMP`, or the OS default).
