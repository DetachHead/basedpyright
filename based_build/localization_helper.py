from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, Dict, TypedDict, Union

from rich.highlighter import ReprHighlighter
from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.color import Color
from textual.screen import Screen
from textual.widgets import Footer, Header, Label, Tabs, Tree
from typing_extensions import override

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


LocMessages = Dict[str, Union[str, _LocMsgComment]]


def get_locfile(language: str = "en-us"):
    return LOCFILES_BASE / f"package.nls.{language}.json"


with get_locfile().open(encoding="utf8") as f:
    LOCDATA_EN_US: dict[str, LocMessages] = json.load(f)


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
    _locnode: ClassVar[dict[str, TreeNode[str]]] = {}
    temp_comp = None
    lang: str = "en-us"

    @override
    def compose(self) -> ComposeResult:
        self.show_root = False
        yield from super().compose()

    @staticmethod
    def add_msgline(node: TreeNode[str], key: str, val: str):
        label = Text.assemble(Text.from_markup(f"[b]{key}[/b] = "), highlighter(repr(val)))
        node.data = key
        node.set_label(label)

    def add_node(self, name: str, data: LocMessages, node: TreeNode[str] | None = None) -> None:
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

    @override
    def compose(self) -> ComposeResult:
        self.styles.align = "center", "middle"
        self.styles.background = Color(0, 0, 0, 0)
        yield (report := Label())
        report.styles.width = "70%"
        report.styles.height = "70%"
        report.styles.border = "solid", Color.parse("gray")
        report.border_title = "Message Keys Difference Report (Press 'c' to close this report)"
        self.compare(report)

    def compare(self, report: Label):
        if self.lang == "en-us":
            report.renderable = "'en-us' is already the original file."
            return
        with get_locfile(self.lang).open() as f:
            data: dict[str, LocMessages] = json.load(f)
        msgs: list[str] = []
        for origdom, origmsgs in LOCDATA_EN_US.items():
            msgs += ["", f"[{origdom}]", diff_keys(origmsgs, data.get(origdom, {}))]
        report.renderable = "\n".join(msgs)


class HelperTUI(App[None]):
    BINDINGS: ClassVar = [
        ("q", "quit()", "Quit program"),
        ("d", "toggle_dark", "Toggle dark mode"),
        ("c", "popup_keydiff", "Compare message keys differences"),
    ]
    TITLE = "BasedPyright Localization Helper"

    @override
    def compose(self) -> ComposeResult:
        """Create child widgets for the app."""
        yield Header()
        yield Footer()
        yield (tabs := Tabs(*ALL_LANGUAGES))
        yield (loctree := LocDataTree("loctree"))
        loctree.load_data(tabs.active_tab.label_text if tabs.active_tab else "en-us")

    @override
    def action_toggle_dark(self) -> None:
        """An action to toggle dark mode."""
        self.dark = not self.dark

    @work
    async def action_popup_keydiff(self) -> None:
        keydiff = MsgDiffReport()
        tabs = self.query_one(Tabs)
        keydiff.lang = tabs.active_tab.label_text if tabs.active_tab else "en-us"
        self.install_screen(keydiff, "keydiff")  # pyright: ignore[reportUnknownMemberType]
        await self.push_screen_wait(keydiff)
        _ = self.uninstall_screen(keydiff)  # pyright: ignore[reportUnknownMemberType]

    def on_tabs_tab_activated(self) -> None:
        tree = self.query_one(LocDataTree)
        if tree.temp_comp:
            tree.temp_comp.remove()
            tree.temp_comp = None
        tabs = self.query_one(Tabs)
        tree.load_data(tabs.active_tab.label_text if tabs.active_tab else "en-us")


if __name__ == "__main__":
    app = HelperTUI()
    app.run()
