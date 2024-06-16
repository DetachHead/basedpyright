from __future__ import annotations

from json import loads
from pathlib import Path
from typing import cast


def get_version() -> str:
    return cast(
        str,
        loads(
            (
                Path(__file__).parent.parent / "packages/pyright-internal/src/version.json"
            ).read_text()
        ),
    )
