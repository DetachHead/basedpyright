from __future__ import annotations

from pathlib import Path
from shutil import copytree

from docify import main as docify  # pyright:ignore[reportMissingTypeStubs]


def main():
    """adds docstrings to the stubs located in `../stubdocs` for any modules that are compiled,
    because otherwise pyright would have no way to see the docstrings because there's no source
    code.

    note that it only generates stubs for modules and objects that exist on your current python
    version and OS."""
    stubs_path = Path("packages/pyright-internal/typeshed-fallback")
    stubs_with_docs_path = Path("docstubs")
    if not stubs_with_docs_path.exists():
        copytree(stubs_path, stubs_with_docs_path, dirs_exist_ok=True)
    docify([str(stubs_with_docs_path / "stdlib"), "--builtins-only", "--in-place"])


if __name__ == "__main__":
    main()
