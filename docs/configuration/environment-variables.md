# Environment variables

If Pyright fails to create a temporary directory (for example in remote/server environments where the OS temp directory doesn't exist or isn't writable), you can override the temp directory root:

-   `PYRIGHT_TMPDIR`: Absolute path to a directory that Pyright can use for temporary files/directories. Pyright will create it if needed.

Pyright otherwise relies on the platform temp directory (for example `TMPDIR`, `TMP`, `TEMP`, or the OS default).
