from __future__ import annotations

import sys
from json import dumps, loads
from pathlib import Path
from typing import cast

version_file = Path(__file__).parents[2] / "packages/pyright-internal/src/version.json"


def get() -> str:
    return cast(str, loads(version_file.read_text()))


def set_version(value: str):
    _ = version_file.write_text(dumps(value))


if __name__ == "__main__":
    set_version(sys.argv[1])
