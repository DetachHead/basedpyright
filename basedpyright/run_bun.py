from __future__ import annotations

import sys
from pathlib import Path
from subprocess import call

current_dir = Path(__file__).parent


def run(script_name: str):
    sys.exit(
        call([
            str(current_dir / "bin/bun") + (".exe" if sys.platform == "win32" else ""),
            current_dir / f"{script_name}.js",
            *sys.argv[1:],
        ])
    )
