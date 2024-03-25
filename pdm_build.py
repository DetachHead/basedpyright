from __future__ import annotations

import os
import sys
from json import loads
from pathlib import Path
from shutil import copyfile, copytree
from subprocess import run
from typing import TypedDict, cast


class PackageJson(TypedDict):
    bin: dict[str, str]


bun_install_dir = Path("./basedpyright")

os.environ["BUN_INSTALL"] = str(bun_install_dir)

bun_exe = bun_install_dir / ("bin/bun" + (".exe" if sys.platform == "win32" else ""))

if sys.platform == "win32":
    _ = run(["powershell.exe", "-c", "irm bun.sh/install.ps1|iex"], check=True)
else:
    _ = run("curl -fsSL https://bun.sh/install | bash -s", shell=True, check=True)

if not Path("node_modules").exists():
    _ = run([bun_exe, "install", "--frozen-lockfile"], check=True)
_ = run([bun_exe, "build:cli:dev"], check=True)

npm_package_dir = Path("packages/pyright")
pypi_package_dir = Path("basedpyright")

copytree(npm_package_dir / "dist", pypi_package_dir / "dist", dirs_exist_ok=True)
for script_path in cast(PackageJson, loads((npm_package_dir / "package.json").read_text()))[
    "bin"
].values():
    _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
