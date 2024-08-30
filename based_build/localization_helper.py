# pyright: reportImplicitOverride=false, reportUninitializedInstanceVariable=false

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, Dict, TypedDict

from rich.highlighter import ReprHighlighter
from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.color import Color
from textual.screen import Screen
from textual.widgets import Footer, Header, Label, Tabs, Tree

if TYPE_CHECKING:
    from textual.widgets.tree import TreeNode

highlighter = ReprHighlighter()

LOCFILES_BASE = (
    Path(__file__).parent.parent / "packages" / "pyright-internal" / "src" / "localization"
)

ALL_LANGUAGES = [t for x in LOCFILES_BASE.iterdir() if (t := x.stem[12:])]


class _LocMsgComment(TypedDict):
    message: str
    comment: str


LocMessages = Dict[str, "str | _LocMsgComment"]


def get_locfile(language: str = "en-us"):
    return LOCFILES_BASE / f"package.nls.{language}.json"


with get_locfile().open(encoding="utf8") as f:
    LOCDATA_EN_US: Dict[str, LocMessages] = json.load(f)  # noqa: UP006


def diff_keys(orig: dict[str, Any], comp: dict[str, Any]):
    msgs: list[str] = []
    orig_set = set(orig.keys())
    comp_set = set(comp.keys())
    if orig_set != comp_set:
        msgs.append("Compared to the original:")
        if missing := orig_set - comp_set:
            msgs.append("these keys are missing: " + ", ".join(missing) + ".")
        if unused := comp_set - orig_set:
            msgs.append("these keys are unused: " + ", ".join(unused) + ".")
    else:
        msgs.append("This object has the same keys as the original.")
    return "\n".join(msgs)


class LocDataTree(Tree[str]):
    _locnode: ClassVar[Dict[str, TreeNode[str]]] = {}  # noqa: UP006
    temp_comp = None
    lang: str

    def compose(self) -> ComposeResult:
        self.show_root = False
        yield from super().compose()

    @staticmethod
    def add_msgline(node: TreeNode[str], key: str, val: str):
        label = Text.assemble(Text.from_markup(f"[b]{key}[/b] = "), highlighter(repr(val)))
        node.data = key
        node.set_label(label)

    def add_node(self, name: str, data: LocMessages, node: TreeNode[str] | None = None) -> None:
        """Adds a node to the tree.

        Args:
        ----
            name: Name of the node.
            node: Parent node.f"{{}} {name}"
            data: Data associated with the node.
        """
        if name in self._locnode:
            node = self._locnode[name]
            node.remove_children()
        if node is None:
            node = self.root.add(name, name)
            self._locnode[name] = node
        node.set_label(Text(f"{{}} {name}"))
        for key, value in data.items():
            new_node = node.add_leaf("")
            if isinstance(value, str):
                self.add_msgline(new_node, key, value)
            else:
                self.add_msgline(new_node, key, value["message"])

    def load_data(self, lang: str = "en-us"):
        self.lang = lang
        with get_locfile(lang).open(encoding="utf8") as f:
            data: dict[str, LocMessages] = json.load(f)
            for dom, dat in data.items():
                self.add_node(dom, dat)

    def on_tree_node_selected(self, event: Tree.NodeSelected[str]) -> None:
        if self.lang == "en-us":
            return
        selected = event.node
        if selected.data is None or selected == self.temp_comp:
            return
        parent = selected.parent
        if not parent or parent.data is None:
            return
        if self.temp_comp is not None:
            self.temp_comp.remove()
        self.temp_comp = parent.add_leaf("", after=selected)
        msg = LOCDATA_EN_US[parent.data][selected.data]
        if isinstance(msg, str):
            self.add_msgline(self.temp_comp, f"{'':>{len(selected.data) - 7}}\\[en-us]", msg)
        else:
            self.add_msgline(
                self.temp_comp, f"{'':>{len(selected.data) - 7}}\\[en-us]", msg["message"]
            )


class MsgDiffReport(Screen[None]):
    BINDINGS: ClassVar = [("c", "dismiss()")]
    lang = "en-us"

    def compose(self) -> ComposeResult:
        self.styles.align = "center", "middle"
        self.report = Label()
        self.report.styles.width = "70%"
        self.report.styles.height = "70%"
        self.report.styles.border = "solid", Color.parse("gray")
        self.report.border_title = "Message Keys Difference Report"
        self.compare()
        yield self.report

    def compare(self):
        if self.lang == "en-us":
            self.report.renderable = "'en-us' is already the original file."
            return
        with get_locfile(self.lang).open() as f:
            data: dict[str, LocMessages] = json.load(f)
        msgs: list[str] = []
        for origdom, origmsgs in LOCDATA_EN_US.items():
            msgs += ["", f"[{origdom}]", diff_keys(origmsgs, data.get(origdom, {}))]
        self.report.renderable = "\n".join(msgs)


class HelperTUI(App[None]):
    BINDINGS: ClassVar = [
        ("q", "quit()", "Quit program"),
        ("d", "toggle_dark", "Toggle dark mode"),
        ("c", "popup_keydiff", "Compare message keys differences"),
    ]
    TITLE = "BasedPyright Localization Helper"

    def compose(self) -> ComposeResult:
        """Create child widgets for the app."""
        yield Header()
        yield Footer()
        self.tabs = Tabs(*ALL_LANGUAGES)
        yield self.tabs
        self.loctree: LocDataTree = LocDataTree("loctree")
        self.loctree.load_data(self.tabs.active_tab.label_text if self.tabs.active_tab else "en-us")
        yield self.loctree

    def action_toggle_dark(self) -> None:
        """An action to toggle dark mode."""
        self.dark = not self.dark

    @work
    async def action_popup_keydiff(self) -> None:
        self.keydiff = MsgDiffReport()
        self.keydiff.lang = self.tabs.active_tab.label_text if self.tabs.active_tab else "en-us"
        self.install_screen(self.keydiff, "keydiff")  # pyright: ignore[reportUnknownMemberType]
        await self.push_screen_wait(self.keydiff)
        _ = self.uninstall_screen(self.keydiff)  # pyright: ignore[reportUnknownMemberType]

    def on_tabs_tab_activated(self) -> None:
        if self.loctree.temp_comp:
            self.loctree.temp_comp.remove()
            self.loctree.temp_comp = None
        self.loctree.load_data(self.tabs.active_tab.label_text if self.tabs.active_tab else "en-us")


if __name__ == "__main__":
    app = HelperTUI()
    app.run()
