"""
these tests assume that the doc stubs have already run (they should get run as part of
`uv sync`) as they validate that the current state of the `docstubs` folder is correct
"""

from __future__ import annotations

import os
import sys
from functools import wraps
from locale import getpreferredencoding
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from pytest import mark

if TYPE_CHECKING:
    from basedtyping import P, T


def needs_all_docstubs(
    condition_to_run_locally: bool,  # noqa: FBT001
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    def decorator(fn: Callable[P, T]) -> Callable[P, T]:
        @wraps(fn)
        @mark.needs_all_docstubs
        @mark.skipif(
            not condition_to_run_locally and not os.getenv("GITHUB_ACTIONS"),
            reason="condition not met",
        )
        def wrapped(*args: P.args, **kwargs: P.kwargs):
            return fn(*args, **kwargs)

        return wrapped

    return decorator


def read_module_text(name: str):
    return Path("docstubs/stdlib", name).read_text(
        encoding=getpreferredencoding(do_setlocale=False)
    )


def test_builtin_docstring():
    assert '''
class float:
    """Convert a string or number to a floating point number, if possible."""
''' in read_module_text("builtins.pyi")


@needs_all_docstubs(sys.platform == "win32")
def test_windows_only_docstring():
    assert read_module_text("nt.pyi").startswith('''"""
This module provides access to operating system functionality that is
standardized by the C Standard and the POSIX standard (a thinly
disguised Unix interface).  Refer to the library manual and
corresponding Unix manual entries for more information on calls.
"""''')


@needs_all_docstubs(sys.platform != "win32")
def test_linux_or_mac_only_docstring():
    assert '''
    def tzset() -> None:
        """
        tzset()

        Initialize, or reinitialize, the local timezone to the value stored in
        os.environ['TZ']. The TZ environment variable should be specified in
        standard Unix timezone format as documented in the tzset man page
        (eg. 'US/Eastern', 'Europe/Amsterdam'). Unknown timezones will silently
        fall back to UTC. If the TZ environment variable is not set, the local
        timezone is set to the systems best guess of wallclock time.
        Changing the TZ environment variable without calling tzset *may* change
        the local timezone used by methods such as localtime, but this behaviour
        should not be relied on.
        """
''' in read_module_text("time.pyi")
