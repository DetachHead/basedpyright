/// <reference path="typings/fourslash.d.ts" />

// @filename: superlib/__init__.pyi
// @library: true
//// class LibBase:
////     def [|libm|](self) -> None: ...

// @filename: test.py
//// from typing import Generic, Protocol, TypeAlias, TypeVar, overload
//// from superlib import LibBase
////
//// # 14. base via TypeAlias -> still finds the aliased class method
//// class S14Base:
////     def [|m14|](self) -> None:
////         pass
//// S14Alias: TypeAlias = S14Base
//// class S14Child(S14Alias):
////     def /*marker14*/[|m14|](self) -> None:
////         pass
////
//// # 15. Generic base -> finds the method in the generic class
//// T = TypeVar("T")
//// class S15Base(Generic[T]):
////     def [|process|](self, value: T) -> T: ...
//// class S15Child(S15Base[int]):
////     def /*marker15*/[|process|](self, value: int) -> int:
////         return value
////
//// # 1. simple inheritance: B(A), both define m1 -> [B.m1, A.m1]
//// class S1A:
////     def [|m1|](self) -> None:
////         pass
//// class S1B(S1A):
////     def /*marker1*/[|m1|](self) -> None:
////         pass
////
//// # 2. transitive, direct parent does NOT define m2 -> only [S2C.m2]
//// class S2A:
////     def m2(self) -> None:
////         pass
//// class S2B(S2A):
////     pass
//// class S2C(S2B):
////     def /*marker2*/[|m2|](self) -> None:
////         pass
////
//// # 3. transitive, all define m3 -> [S3C.m3, S3B.m3] (not S3A.m3)
//// class S3A:
////     def m3(self) -> None:
////         pass
//// class S3B(S3A):
////     def [|m3|](self) -> None:
////         pass
//// class S3C(S3B):
////     def /*marker3*/[|m3|](self) -> None:
////         pass
////
//// # 4. multiple inheritance: D(B, C), both define m4 -> [S4D.m4, S4B.m4, S4C.m4]
//// class S4B:
////     def [|m4|](self) -> None:
////         pass
//// class S4C:
////     def [|m4|](self) -> None:
////         pass
//// class S4D(S4B, S4C):
////     def /*marker4*/[|m4|](self) -> None:
////         pass
////
//// # 5. multiple inheritance, only one base defines m5 -> [S5D.m5, S5C.m5]
//// class S5B:
////     pass
//// class S5C:
////     def [|m5|](self) -> None:
////         pass
//// class S5D(S5B, S5C):
////     def /*marker5*/[|m5|](self) -> None:
////         pass
////
//// # 6. not overridden -> unchanged (only local decl)
//// class S6Solo:
////     def /*marker6*/[|m6|](self) -> None:
////         pass
////
//// # 7. cursor in the method body -> unchanged
//// class S7A:
////     def m7(self) -> None:
////         pass
//// class S7B(S7A):
////     def m7(self) -> None:
////         [|local7|] = 1
////         return /*marker7*/local7
////
//// # 8. cursor on a call site self.m() -> unchanged (no regression)
//// class S8Base:
////     def [|m8|](self) -> None:
////         pass
//// class S8Child(S8Base):
////     def caller(self) -> None:
////         self./*marker8*/m8()
////
//// # 9. cursor on a parameter -> unchanged
//// class S9A:
////     def m9(self) -> None:
////         pass
//// class S9B(S9A):
////     def m9(self, /*marker9*/[|p9: int|]) -> None:
////         pass
////
//// # 10. free function with the same name as a method -> unchanged
//// def /*marker10*/[|freefn|]() -> None:
////     pass
//// class S10Has:
////     def freefn(self) -> None:
////         pass
////
//// # 11. overloads in the direct parent -> all overload decls listed
//// class S11Base:
////     @overload
////     def [|m11|](self) -> None: ...
////     @overload
////     def [|m11|](self, a: int) -> None: ...
////     def [|m11|](self, a: int = 0) -> None:
////         pass
//// class S11Child(S11Base):
////     def /*marker11*/[|m11|](self, a: int = 0) -> None:
////         pass
////
//// # 12. parent defined in a .pyi -> location points to the .pyi
//// class S12Child(LibBase):
////     def /*marker12*/[|libm|](self) -> None:
////         pass
////
//// # 13. parent is a Protocol -> returns the method decl in the Protocol
//// class S13Proto(Protocol):
////     def [|m13|](self) -> int: ...
//// class S13Impl(S13Proto):
////     def /*marker13*/[|m13|](self) -> int:
////         return 0

{
    const rangeMap = helper.getRangesByText();

    const expected = (text: string) => ({
        definitions: rangeMap
            .get(text)!
            .filter((r) => !r.marker)
            .map((r) => ({ path: r.fileName, range: helper.convertPositionRange(r) })),
    });

    helper.verifyFindDefinitions(
        {
            marker1: expected('m1'),
            marker2: expected('m2'),
            marker3: expected('m3'),
            marker4: expected('m4'),
            marker5: expected('m5'),
            marker6: expected('m6'),
            marker7: expected('local7'),
            marker8: expected('m8'),
            marker9: expected('p9: int'),
            marker10: expected('freefn'),
            marker11: expected('m11'),
            marker12: expected('libm'),
            marker13: expected('m13'),
            marker14: expected('m14'),
            marker15: expected('process'),
        },
        'all'
    );
}
