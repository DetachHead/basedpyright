from __future__ import annotations

from json import loads
from pathlib import Path
from shutil import copyfile, copytree
from typing import TypedDict, cast

from nodejs_wheel.executable import npm


class PackageJson(TypedDict):
    bin: dict[str, str]


def run_npm(*args: str):
    exit_code = npm(args)
    if exit_code != 0:
        raise Exception(f"the following npm command exited with {exit_code=}: {args}")


run_npm("ci")
run_npm("run", "build:cli:dev")

npm_package_dir = Path("packages/pyright")
pypi_package_dir = Path("basedpyright")

copytree(npm_package_dir / "dist", pypi_package_dir / "dist", dirs_exist_ok=True)
for script_path in cast(PackageJson, loads((npm_package_dir / "package.json").read_text()))[
    "bin"
].values():
    _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
