from typing import Any, Callable, Tuple, dataclass_transform
from abc import ABCMeta

from .fields import Field

@dataclass_transform(kw_only_default=True, field_specifiers=(Field,))
class ModelMetaclass(ABCMeta): ...


class BaseModel(metaclass=ModelMetaclass): ...
