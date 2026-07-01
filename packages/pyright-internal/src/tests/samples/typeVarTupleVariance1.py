# This sample tests variance inference for ParamSpec type parameters.

from typing import TypeVarTuple

Ts_co = TypeVarTuple("Ts_co", covariant=True)
Ts_contra = TypeVarTuple("Ts_contra", contravariant=True)
Ts_infer = TypeVarTuple("Ts_infer", infer_variance=True)


class ShouldBeContravariant1[*OutTs]:
    def f(self, t: tuple[*OutTs]): ...


vcontra1_1: ShouldBeContravariant1[object] = ShouldBeContravariant1[int]()  # pyright: ignore[reportAssignmentType]
vcontra1_2: ShouldBeContravariant1[int] = ShouldBeContravariant1[object]()  # OK


class ShouldBeCovariant1[*OutTs]:
    def f(self) -> tuple[*OutTs]: ...


vco1_1: ShouldBeCovariant1[int] = ShouldBeCovariant1[object]()  # pyright: ignore[reportAssignmentType]
vco1_2: ShouldBeCovariant1[object] = ShouldBeCovariant1[int]()  # OK


class ShouldBeInvariant1[*OutTs]:
    def f(self, t: tuple[*OutTs]) -> tuple[*OutTs]: ...


vinv1_1: ShouldBeInvariant1[object] = ShouldBeInvariant1[int]()  # pyright: ignore[reportAssignmentType]
vinv1_2: ShouldBeInvariant1[int] = ShouldBeInvariant1[object]()  # pyright: ignore[reportAssignmentType]
