from __future__ import annotations

import json
from functools import partial
from subprocess import run as stupid_run
from typing import TYPE_CHECKING, Iterable

if TYPE_CHECKING:
    from mkdocs_macros.plugin import MacrosPlugin

run = partial(stupid_run, check=True, capture_output=True)


def define_env(env: MacrosPlugin):
    env.macro(generate_diagnostic_rule_table)  # pyright:ignore[reportUnknownMemberType]


def generate_diagnostic_rule_table() -> str:
    """generates the table of `typeCheckingMode` defaults"""
    _ = run(["npm", "run", "build:cli:dev"])
    diagnostic_rulesets: list[dict[str, bool | str]] = json.loads(
        run(["node", "packages/pyright/index.js", "--printdiagnosticrulesets"]).stdout
    )
    headers = diagnostic_rulesets[0].keys()
    result: list[Iterable[str]] = [(f"**{header}**" for header in headers), (":-" for _ in headers)]
    for row in diagnostic_rulesets:
        diagnostic_rule, *values = row.values()
        result.append([str(diagnostic_rule), *(json.dumps(value) for value in values)])
    return "\n".join("|".join(row) for row in result)
