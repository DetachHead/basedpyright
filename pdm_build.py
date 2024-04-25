from __future__ import annotations

from json import loads
from pathlib import Path
from shutil import copyfile, copytree
from typing import List, TypedDict, cast

from nodejs_wheel import executable

# Remove when https://github.com/njzjz/nodejs-wheel/pull/24 is merged
def run(cmd: List[str]):
    old_sys_argv = sys.argv
    sys.argv = [old_sys_argv[0]] + cmd
    try:
        executable.npm()
    finally:
        sys.argv = old_sys_argv


class PackageJson(TypedDict):
    bin: dict[str, str]


run(["ci"])
run(["run", "build:cli:dev"])

npm_package_dir = Path("packages/pyright")
pypi_package_dir = Path("basedpyright")

copytree(npm_package_dir / "dist", pypi_package_dir / "dist", dirs_exist_ok=True)
for script_path in cast(PackageJson, loads((npm_package_dir / "package.json").read_text()))[
    "bin"
].values():
    _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
