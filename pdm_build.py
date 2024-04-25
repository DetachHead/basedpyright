from __future__ import annotations

import sys
from json import loads
from pathlib import Path
from shutil import copyfile, copytree
from subprocess import run  # noqa: S404
from typing import TypedDict, cast

from nodejs_wheel.executable import ROOT_DIR  # pyright:ignore[reportMissingTypeStubs]

node_exe = Path(ROOT_DIR, ("node.exe" if sys.platform == "win32" else "bin/node"))

npm_script = Path(ROOT_DIR, "lib", "node_modules", "npm", "bin", "npm-cli.js")


# Remove when https://github.com/njzjz/nodejs-wheel/pull/24 is merged
def npm(cmd: list[str]):
    _ = run([node_exe, npm_script, *cmd], check=True)  # noqa: S603


class PackageJson(TypedDict):
    bin: dict[str, str]


npm(["ci"])
npm(["run", "build:cli:dev"])

npm_package_dir = Path("packages/pyright")
pypi_package_dir = Path("basedpyright")

copytree(npm_package_dir / "dist", pypi_package_dir / "dist", dirs_exist_ok=True)
for script_path in cast(PackageJson, loads((npm_package_dir / "package.json").read_text()))[
    "bin"
].values():
    _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
