from typing import final

@final
class Foo:
    def foo(self): ... # no error
    def _foo(self): ... # error
    def __bar(self): ... # error

class Bar:
    def foo(self): ... # no error
    def _foo(self): ... # no error
    def __bar(self): ... # error
