from __future__ import annotations

from subprocess import run


def test_version():
    """
    pretty useless test, this is mainly just making sure the python wrapper scripts aren't
    busted
    """
    result = run(["basedpyright", "--version"], check=True, capture_output=True)
    assert result.returncode == 0
    assert result.stdout.startswith(b"basedpyright ")
    assert b"based on pyright " in result.stdout
