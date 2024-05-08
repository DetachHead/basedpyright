from __future__ import annotations

import sys
from pathlib import Path

from nodejs_wheel.executable import (  # pyright:ignore[reportMissingTypeStubs]
    node,  # pyright:ignore[reportUnknownVariableType]
)


def run(script_name: str):
    sys.exit(node([Path(__file__).parent / f"{script_name}.js", *sys.argv[1:]]))
