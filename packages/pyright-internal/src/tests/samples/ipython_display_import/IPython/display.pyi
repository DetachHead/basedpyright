"""
fake stub for `IPython.display` so we don't have to use the real one and the test doesn't have to run inside a venv.

see https://github.com/DetachHead/basedpyright/issues/994
"""
def display() -> None: ...
def display_html() -> None: ...