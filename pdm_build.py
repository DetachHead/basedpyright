from __future__ import annotations

from json import loads
from pathlib import Path
from shutil import copyfile, copytree
from typing import TYPE_CHECKING, TypedDict, cast

from docify import main as docify  # pyright:ignore[reportMissingTypeStubs]
from nodejs_wheel.executable import npm
from pdm.backend.hooks.base import BuildHookInterface
from typing_extensions import override

if TYPE_CHECKING:
    from pdm.backend.hooks import Context


class PackageJson(TypedDict):
    bin: dict[str, str]


def run_npm(*args: str):
    exit_code = npm(args)
    if exit_code != 0:
        raise Exception(f"the following npm command exited with {exit_code=}: {args}")


def generate_docstubs():
    """ideally this should be imported from `based_build`. see https://github.com/pdm-project/pdm/issues/2948"""
    stubs_path = Path("packages/pyright-internal/typeshed-fallback")
    stubs_with_docs_path = Path("docstubs")
    if not stubs_with_docs_path.exists():
        copytree(stubs_path, stubs_with_docs_path, dirs_exist_ok=True)
    docify(str(stubs_with_docs_path / "stdlib"), "--builtins-only", "--in-place")


class Hook(BuildHookInterface):
    @override
    def pdm_build_update_files(self, context: Context, files: dict[str, Path]):
        npm_package_dir = Path("packages/pyright")
        pypi_package_dir = Path("basedpyright")
        dist_dir = Path("dist")
        npm_script_paths = cast(PackageJson, loads((npm_package_dir / "package.json").read_text()))[
            "bin"
        ].values()

        generate_docstubs()

        run_npm("ci")
        run_npm("run", "build:cli:dev")

        if context.target == "editable":
            copytree(npm_package_dir / dist_dir, pypi_package_dir / dist_dir, dirs_exist_ok=True)
            for script_path in npm_script_paths:
                _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
        else:
            for file in (npm_package_dir / dist_dir).rglob("**/*"):
                if file.is_file():
                    files[str(pypi_package_dir / file.relative_to(npm_package_dir))] = file

            for script_path in npm_script_paths:
                files[str(pypi_package_dir / script_path)] = npm_package_dir / script_path


# https://github.com/pdm-project/pdm/issues/2945
pdm_build_update_files = Hook().pdm_build_update_files  # pyright:ignore[reportAbstractUsage]
