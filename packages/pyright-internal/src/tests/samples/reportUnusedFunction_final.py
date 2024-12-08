from typing import final, override

@final
class Final:
    def foo(self): ... # no error
    def _foo(self): ... # error
    def __bar(self): ... # error

class NotFinal:
    def foo(self): ... # no error
    def _foo(self): ... # no error
    def __bar(self): ... # error

@final
class FinalWithExplicitOverride(NotFinal):
    @override
    def _foo(self): ... # no error

@final
class FinalWithImplicitOverride(NotFinal):
    def _foo(self): ... # no error
    def _bar(self): ... # error
