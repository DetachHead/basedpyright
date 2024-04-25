from __future__ import annotations

import sys
from pathlib import Path

from nodejs_wheel import executable  # pyright:ignore[reportMissingTypeStubs]


def run(script_name: str):
    sys.exit(executable.call_node(Path(__file__).parent / f"{script_name}.js", *sys.argv[1:]))  # pyright:ignore[reportUnknownMemberType]
