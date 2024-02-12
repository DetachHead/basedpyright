from __future__ import annotations

import sys
from pathlib import Path

from nodejs.node import call  # pyright:ignore[reportAny]


def run(script_name: str):
    sys.exit(call([Path(__file__).parent / f"{script_name}.js", *sys.argv[1:]]))
