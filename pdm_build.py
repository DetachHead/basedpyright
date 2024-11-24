from __future__ import annotations

from json import loads
from pathlib import Path
from shutil import copy, copyfile, copytree
from typing import TYPE_CHECKING, TypedDict, cast

from nodejs_wheel.executable import npm
from pdm.backend.hooks.base import BuildHookInterface
from typing_extensions import override

from build.generate_docstubs import main as generate_docstubs

if TYPE_CHECKING:
    from pdm.backend.hooks import Context


class PackageJson(TypedDict):
    bin: dict[str, str]


def run_npm(*args: str):
    exit_code = npm(args)
    if exit_code != 0:
        raise Exception(f"the following npm command exited with {exit_code=}: {args}")


# https://github.com/pdm-project/pdm-backend/issues/247
class Hook(BuildHookInterface):  # pyright:ignore[reportImplicitAbstractClass]
    @override
    def pdm_build_update_files(self, context: Context, files: dict[str, Path]):
        if context.target not in {"editable", "wheel"}:
            return
        npm_package_dir = Path("packages/pyright")
        pypi_package_dir = Path("basedpyright")
        dist_dir = Path("dist")
        package_json = "package.json"
        npm_script_paths = cast(PackageJson, loads((npm_package_dir / package_json).read_text()))[
            "bin"
        ].values()
        if context.builder.config_settings.get("regenerate_docstubs") != "false":
            generate_docstubs(overwrite=True)

        run_npm("ci")
        run_npm("run", "build:cli:dev")

        if context.target == "editable":
            copy(npm_package_dir / package_json, pypi_package_dir)
            copytree(npm_package_dir / dist_dir, pypi_package_dir / dist_dir, dirs_exist_ok=True)
            for script_path in npm_script_paths:
                _ = copyfile(npm_package_dir / script_path, pypi_package_dir / script_path)
        else:
            files[str(pypi_package_dir / package_json)] = npm_package_dir / package_json
            for file in (npm_package_dir / dist_dir).rglob("**/*"):
                if file.is_file():
                    files[str(pypi_package_dir / file.relative_to(npm_package_dir))] = file

            for script_path in npm_script_paths:
                files[str(pypi_package_dir / script_path)] = npm_package_dir / script_path


# https://github.com/pdm-project/pdm/issues/2945
pdm_build_update_files = Hook().pdm_build_update_files  # pyright:ignore[reportAbstractUsage]
