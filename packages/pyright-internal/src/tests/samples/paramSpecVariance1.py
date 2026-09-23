# This sample tests variance inference for TypeVarTuple type parameters.

from typing import Callable, ParamSpec

P_co = ParamSpec("P_co", covariant=True)
P_contra = ParamSpec("P_contra", contravariant=True)
P_infer = ParamSpec("P_infer", infer_variance=True)


class ShouldBeContravariant1[**OutP]:
    def f(self) -> Callable[OutP, None]: ...


vcontra1_1: ShouldBeContravariant1[object] = ShouldBeContravariant1[int]()  # pyright: ignore[reportAssignmentType]
vcontra1_2: ShouldBeContravariant1[int] = ShouldBeContravariant1[object]()  # OK


class ShouldBeCovariant1[**OutP]:
    def f(self, fn: Callable[OutP, None]) -> None: ...


vco1_1: ShouldBeCovariant1[int] = ShouldBeCovariant1[object]()  # pyright: ignore[reportAssignmentType]
vco1_2: ShouldBeCovariant1[object] = ShouldBeCovariant1[int]()  # OK


class ShouldBeInvariant1[**OutP]:
    def f(self, fn: Callable[OutP, None]) -> Callable[OutP, None]: ...


vinv1_1: ShouldBeInvariant1[object] = ShouldBeInvariant1[int]()  # pyright: ignore[reportAssignmentType]
vinv1_2: ShouldBeInvariant1[int] = ShouldBeInvariant1[object]()  # pyright: ignore[reportAssignmentType]
