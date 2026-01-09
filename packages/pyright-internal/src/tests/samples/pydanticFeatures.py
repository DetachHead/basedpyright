# pyright: reportMissingModuleSource=false
from __future__ import annotations


from pydantic import BaseModel, Field, ConfigDict


class M1(BaseModel):
    """populate_by_name=True allows __init__ to accept field names in addition to aliases"""
    model_config = ConfigDict(populate_by_name=True)
    a: int = Field(alias="b")

# With populate_by_name=True, we can pass either the field name "a" or the alias name "b"
_ = M1(
    a=1,
)
_ = M1(
    b=1,
)
# but not other things
_ = M1(
    z=1,  # expect an error
)

class M7(BaseModel):
    """frozen-ness is configurable from `model_config`"""
    model_config = ConfigDict(frozen=True)
    a: int = 1

M7().a = 2  # this should report an error

class M8(M7):
    """inherited config"""
    b: int = 2

M8().b = 2  # this should report an error


class M9(BaseModel):
    "attribute starting with an underscore is not a field"
    _a: int
    b: int

m9 = M9(b=1)  # this should not be an error


class M10(BaseModel):
    """positional `default` `field` on `dataclass`"""
    a: int = Field(1)

M10()  # this should not be an error
