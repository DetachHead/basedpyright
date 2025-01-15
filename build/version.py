from __future__ import annotations

import sys
from json import dumps, loads
from pathlib import Path
from subprocess import run
from typing import cast

version_file = Path(__file__).parent.parent / "packages/pyright-internal/src/version.json"


def get() -> str:
    return cast(str, loads(version_file.read_text()))


def set_version(value: str):
    _ = version_file.write_text(dumps(value))


if __name__ == "__main__":
    set_version(sys.argv[1])
    # unfortunately this is needed to update the version in the lockfile. we could make this script
    # much faster by manually updating it ourselves, but i don't want to have to update this when
    # there are changes to uv's lockfile format
    _ = run(["uv", "sync", "--upgrade-package", "basedpyright"], check=True, text=True)
