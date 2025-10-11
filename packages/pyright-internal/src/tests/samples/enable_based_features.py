from dataclasses import dataclass
from typing import dataclass_transform

@dataclass_transform(
    skip_replace=True,
    frozen_default=True,
)
def frozen[T: type](t: T) -> T:
    return dataclass(frozen=True, slots=True)(t)

