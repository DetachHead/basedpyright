from __future__ import annotations

import ast
import os
from pathlib import Path
from shutil import copytree, rmtree
from typing import Final

from docify import main as docify  # pyright:ignore[reportMissingTypeStubs]
from typing_extensions import override

KEEP_FLOAT: Final[frozenset[str]] = frozenset((
    # Example:
    # If we didn't want to change the type of the `priority` parameter
    # of the `register` function in the `Registry` class of markdown/util.pyi
    # "stubs/Markdown/markdown/util.pyi/Registry.register.priority",
    # See implementation `_node_path` for details on this identifier string.
))
""" identifiers for `float` that we don't want to change to `float | int` """


def name_for_target(node: ast.AnnAssign) -> str:
    return (
        node.target.id
        if isinstance(node.target, ast.Name)
        else node.target.attr
        if isinstance(node.target, ast.Attribute)
        else "subscript"
    )


def name_for_node(
    node: ast.ClassDef
    | ast.FunctionDef
    | ast.AsyncFunctionDef
    | ast.arg
    | ast.Name
    | ast.AnnAssign,
) -> str:
    return (
        node.name
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        else node.arg
        if isinstance(node, ast.arg)
        else name_for_target(node)
        if isinstance(node, ast.AnnAssign)
        else node.id
    )


def has_int_child(node: ast.BinOp) -> bool:
    if isinstance(node.right, ast.Name) and node.right.id == "int":
        return True
    if isinstance(node.left, ast.Name) and node.left.id == "int":
        return True
    if isinstance(node.right, ast.BinOp):
        # assuming "|" is the only BinOp in annotations
        assert isinstance(node.right.op, ast.BitOr), node.right.op
        if has_int_child(node.right):
            return True
    if isinstance(node.left, ast.BinOp):
        assert isinstance(node.left.op, ast.BitOr), node.left.op
        if has_int_child(node.left):
            return True
    return False


class AnnotationTrackingVisitor(ast.NodeVisitor):
    parent_stack: list[ast.AST]
    in_ann: str | None = None
    floats: list[ast.Name]
    module: str

    def __init__(self, module: str) -> None:
        self.parent_stack = []
        self.floats = []
        self.module = module

    @override
    def visit(self, node: ast.AST) -> None:
        self.parent_stack.append(node)
        super().visit(node)
        _ = self.parent_stack.pop()

    @override
    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        assert len(list(ast.iter_fields(node))) == 4, list(ast.iter_fields(node))
        # I don't know what the 4th field "simple" is, but it's not an AST.

        self.visit(node.target)

        self.in_ann = name_for_target(node)
        self.visit(node.annotation)
        self.in_ann = None

        if node.value:
            self.visit(node.value)

    @override
    def visit_arg(self, node: ast.arg) -> None:
        # arg name str, annotation, type comment str
        assert len(list(ast.iter_fields(node))) == 3, list(ast.iter_fields(node))

        self.in_ann = node.arg
        if node.annotation:
            self.visit(node.annotation)
        self.in_ann = None

    # NOTE: assuming function return values are actually float if annotated as such.
    # If we don't want to assume that, uncomment this:
    # (probably would also want `visit_AsyncFunctionDef`)

    # @override
    # def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
    #     # Copied from implementation of base generic_visit
    #     # and modified for "returns"
    #     for field, value in ast.iter_fields(node):
    #         if isinstance(value, list):
    #             for item in value:
    #                 if isinstance(item, ast.AST):
    #                     self.visit(item)
    #         elif isinstance(value, ast.AST):
    #             if field == "returns":
    #                 self.in_ann = "returns"
    #             self.visit(value)
    #             if field == "returns":
    #                 self.in_ann = None

    def _node_path(self) -> str:
        """a string that identifies the current node (from `self.parent_stack`)"""
        strs = [
            name_for_node(n)
            for n in self.parent_stack
            if isinstance(
                n,
                (
                    ast.ClassDef,
                    ast.FunctionDef,
                    ast.AsyncFunctionDef,
                    ast.arg,
                    ast.Name,
                    ast.AnnAssign,
                ),
            )
        ]
        if len(strs) > 0 and strs[-1] == "float":
            _ = strs.pop()
        return self.module + "/" + ".".join(strs)

    def _with_int(self) -> bool:
        """`float | int` already"""
        assert isinstance(self.parent_stack[-1], ast.Name), self.parent_stack
        assert self.parent_stack[-1].id == "float", self.parent_stack[-1].id
        index = len(self.parent_stack) - 2
        while index >= 0:
            traverse_node = self.parent_stack[index]
            if not isinstance(traverse_node, ast.BinOp):
                return False
            # assuming "|" is the only BinOp in annotations
            assert isinstance(traverse_node.op, ast.BitOr), traverse_node.op
            if has_int_child(traverse_node):
                return True
            index -= 1
        return False

    def _is_final(self) -> bool:
        assert isinstance(self.parent_stack[-1], ast.Name), self.parent_stack
        assert self.parent_stack[-1].id == "float", self.parent_stack
        if len(self.parent_stack) > 1:
            parent = self.parent_stack[-2]
            if (
                isinstance(parent, ast.Subscript)
                and isinstance(parent.value, ast.Name)
                and parent.value.id == "Final"
            ):
                assert parent.slice is self.parent_stack[-1], parent.slice
                return True
        return False

    @override
    def generic_visit(self, node: ast.AST) -> None:
        if self.in_ann is not None and isinstance(node, ast.Name) and node.id == "float":
            assert node is self.parent_stack[-1], self.parent_stack

            if self._with_int() or self._is_final():
                # There's already some already float | int in typeshed
                # and assuming `Final[float]` is really float
                pass
            else:
                node_path = self._node_path()
                if node_path not in KEEP_FLOAT:
                    self.floats.append(node)
        super().generic_visit(node)


def float_expand(stubs_with_docs_path: Path) -> None:
    """change stubs in the given directory from `float` to `float | int`"""
    for dir_path, _dir_names, file_names in os.walk(stubs_with_docs_path):
        for file_name in file_names:
            if not file_name.endswith(".pyi"):
                continue
            file_path = Path(dir_path) / file_name
            rel_path = Path(os.path.relpath(file_path, stubs_with_docs_path)).as_posix()
            file_bytes = Path(file_path).read_bytes()
            file_parsed = ast.parse(file_bytes)
            v = AnnotationTrackingVisitor(rel_path)
            v.visit(file_parsed)

            if len(v.floats) > 0:
                print(file_path.as_posix())
                # compute start offset of each line in file
                lines = file_bytes.split(b"\n")
                line_starts = [0]
                for line in lines:
                    line_starts.append(line_starts[-1] + len(line) + 1)  # +1 for newline

                # process in reverse order to avoid offset changes affecting subsequent replacements
                v.floats.sort(key=lambda n: (n.lineno, n.col_offset), reverse=True)
                for fl in v.floats:
                    assert fl.end_lineno == fl.lineno, fl  # always within 1 line
                    assert fl.end_col_offset is not None
                    assert fl.end_col_offset == fl.col_offset + 5  # always "float" 5 chars

                    # calculate offsets in file (from offsets in line)
                    line_start = line_starts[fl.lineno - 1]
                    start_offset = line_start + fl.col_offset
                    end_offset = line_start + fl.end_col_offset

                    assert file_bytes[start_offset:end_offset] == b"float", file_bytes[
                        start_offset:end_offset
                    ]

                    file_bytes = (
                        file_bytes[:start_offset] + b"float | int" + file_bytes[end_offset:]
                    )

                _ = Path(file_path).write_bytes(file_bytes)


def main(*, overwrite: bool):
    """
    adds docstrings to the stubs located in `../stubdocs` for any modules that are compiled,
    because otherwise pyright would have no way to see the docstrings because there's no source
    code.

    note that it only generates stubs for modules and objects that exist on your current python
    version and OS.

    :param overwrite:
        whether to overwrite existing generated docstubs if they already exist. should be `True`
        when running locally to avoid running with a potentially outdated version of typeshed, but
        `False` in CI when generating them for all platforms because it needs to run multiple times
        on the previously generated output
    """
    stubs_path = Path("packages/pyright-internal/typeshed-fallback")
    stubs_with_docs_path = Path("docstubs")
    if overwrite:
        if stubs_with_docs_path.exists():
            rmtree(stubs_with_docs_path)
        copytree(stubs_path, stubs_with_docs_path, dirs_exist_ok=False)
    elif not stubs_with_docs_path.exists():
        copytree(stubs_path, stubs_with_docs_path, dirs_exist_ok=True)
    float_expand(stubs_with_docs_path)
    docify([str(stubs_with_docs_path / "stdlib"), "--if-needed", "--in-place"])


if __name__ == "__main__":
    main(overwrite=False)
