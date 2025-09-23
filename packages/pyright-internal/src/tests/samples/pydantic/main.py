from typing import Any, Callable, Tuple, dataclass_transform

from .fields import Field as Field

@dataclass_transform(kw_only_default=True, field_specifiers=(PydanticModelField, PydanticModelPrivateAttr, NoInitField))
class ModelMetaclass(ABCMeta): ...

class BaseModel(metaclass=ModelMetaclass): ...
