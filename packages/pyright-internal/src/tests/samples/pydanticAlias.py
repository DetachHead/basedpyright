# This sample tests Pydantic Field alias handling via dataclass_transform on BaseModel.
# It verifies which names are accepted by the constructor and which attributes
# exist on the resulting instance:
# - Constructor parameters use the alias if provided (e.g. a1 -> b1) or
#   the validation_alias if provided. If both are provided (as for a3),
#   the validation_alias (b3) is accepted while the alias (z) is not.
# - Instance attribute names remain the original field names (a1, a2, a3).
#
# pyright: reportMissingModuleSource=false

from pydantic import BaseModel, Field, AliasChoices, ConfigDict

class M(BaseModel):
    a1: str = Field(alias="b1")
    a2: str = Field(validation_alias="b2")
    a3: str = Field(alias="z", validation_alias="b3")

# These should generate errors because of aliases used on the fields
_ = M(
    a1="hello",
    a2="hello",
    a3="hello",
    z="hello",  # "z" is an alias, but if overridden by `validation_alias`
)

# These should not generate an error.
m1 = M(
    b1="hello",
    b2="hello",
    b3="hello",
)

# Access via the declared field name should be fine.
s: str = m1.a1
s = m1.a2
s = m1.a3

# These should generate errors because the instance exposes attributes, the aliases are not accessable
_ = m1.b1
_ = m1.b2
_ = m1.b3
_ = m1.z


class M2(BaseModel):
    """validation_alias with AliasChoices"""
    a: int = Field(validation_alias=AliasChoices("b", "c"))

_ = M2(
    c=1,  # expect no error because it's dynamic
)


class M3(BaseModel):
    """alias_generator produces dynamic aliases"""
    model_config = ConfigDict(
        alias_generator=lambda s: s.upper(),
    )
    a: int

_ = M3(
    A=1,  # expect no error because it's dynamic
)

