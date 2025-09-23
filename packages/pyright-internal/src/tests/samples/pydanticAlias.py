# This sample tests Pydantic Field alias handling via dataclass_transform on BaseModel.
# It verifies which names are accepted by the constructor and which attributes
# exist on the resulting instance:
# - Constructor parameters use the alias if provided (e.g. a1 -> b1) or
#   the validation_alias if provided. If both are provided (as for a3),
#   the validation_alias (b3) is accepted while the alias (z) is not.
# - Instance attribute names remain the original field names (a1, a2, a3).
#
# pyright: reportMissingModuleSource=false

from pydantic.main import BaseModel, Field


class M(BaseModel):
    a1: str = Field(alias="b1")
    a2: str = Field(validation_alias="b2")
    a3: str = Field(alias="z", validation_alias="b3")

# These should generate errors because the constructor expects keywords "b1", "b2", and "b3"
# (from alias/validation_alias), not "a1", "a2", or "a3".
m1 = M(
    a1="hello",
    a2="hello",
    a3="hello",
)

# These should not generate an error for b1, b2, and b3. The use of "z" below should
# generate an error because for a3 the constructor accepts the validation_alias ("b3")
# and does not accept the alias ("z").
m2 = M(
    b1="hello",
    b2="hello",
    b3="hello",
    z="hello",  # This should generate an error ("z" is an alias, not an accepted constructor param when validation_alias is present).
)

# Access via the declared field name should be fine.
_: str = m2.a1
_: str = m2.a2
_: str = m2.a3

# These should generate errors because the instance exposes attributes a1, a2, and a3.
# Aliases/validation_aliases (b1, b2, b3, z) are not attribute names on the instance.
_ = m2.b1
_ = m2.b2
_ = m2.b3
_ = m2.z
