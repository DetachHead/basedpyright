from contextlib import AbstractContextManager
from typing import ContextManager

ContextManagerAlias = ContextManager
AbstractContextManagerAlias = AbstractContextManager

foo: ContextManagerAlias[None]
bar: AbstractContextManagerAlias[None] # error
baz: ContextManager[None]
qux: AbstractContextManager[None] # error
