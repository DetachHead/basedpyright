/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: classes/__init__.py
// @library: true
//// from enum import Enum
//// from typing import NotRequired, TypedDict
////
////
//// class A:
////     pass
////
////
//// class B:
////     def [|__radd__|](self, lhs: A) -> "B":
////         return B()
////
////
//// class C(TypedDict):
////     [|/*Ca*/a|]: int
////     [|/*Cb*/b|]: NotRequired[float]
////
////
//// class D(TypedDict):
////     [|/*Da*/a|]: int
////     """an integer"""
////     b: NotRequired[float]
////
////
//// class E(Enum):
////     [|/*EA*/A|] = 1
////     [|/*EB*/B|] = 2

// @filename: stubs/__init__.py
// @library: true
//// from typing import overload
////
//// class S0:
////     @overload
////     def __getitem__(self, i: int) -> float: ...
////     @overload
////     def [|/*S0GetItemSlice*/__getitem__|](self, i: slice) -> list[float]: ...

// @filename: typeshed-fallback/stdlib/builtins.py
//// class int:
////   def [|/*intAdd*/__add__|](self, other: int) -> "int": ...
////   def [|/*intInvert*/__invert__|](self) -> "int": ...
////   def [|/*intAnd*/__and__|](self, value: int, /) -> "int": ...
////   def [|/*intLt*/__lt__|](self, value: int, /) -> bool: ...
////   def [|/*intBool*/__bool__|](self) -> bool: ...
////
//// class tuple[T]:
////   def [|/*tupleRmul*/__rmul__|](self, value: int, /) -> tuple[T, ...]: ...
////   def [|/*tupleIn*/__contains__|](self, key: object, /) -> bool: ...
////   def [|/*tupleGetItem*/__getitem__|](self, key: int | slice, /) -> T | tuple[T, ...]: ...
////
//// class list[T]:
////   def [|/*listGetItem*/__getitem__|](self, i: int, /) -> T: ...
////   def [|/*listSetItem*/__setitem__|](self, key: int, value: T, /) -> None: ...
////
//// class dict[K, V]:
////   def [|/*DictSetItem*/__setitem__|](self, key: K, value: V, /) -> None: ...
////   def [|/*DictGetItem*/__getitem__|](self, key: K, /) -> V: ...
////   def [|/*DictDelItem*/__delitem__|](self, key: K, /) -> None: ...
////
//// class str:
////   def [|/*LitStrGetItem*/__getitem__|](self, key: int | slice, /): ...

// @filename: typeshed-fallback/stdlib/enum.py
//// from typing import TypeVar
////
//// _EnumMemberT = TypeVar("_EnumMemberT")
////
//// class EnumMeta(type):
////     def [|/*EnumGetItem*/__getitem__|](self: type[_EnumMemberT], name: str) -> _EnumMemberT: ...

// @filename: test.py
//// from classes import A, B, C, D, E
//// from stubs import S0
////
//// A() [|/*marker1*/+|] B()
//// a = 1 [|/*marker2*/+|] 2
//// a [|/*marker3*/+=|] 3
//// b = ([|/*marker4a*/~|]a [|/*marker4b*/&|] 255,)
//// c = 4 [|/*marker5*/*|] b
//// d = 5 not [|/*marker6*/in|] c
//// e = a <[|/*marker7a*/|] b[0[|/*marker7b*/|]][|/*marker7c*/|]
//// f = e [|/*marker8a*/or|] [|/*marker8b*/not|] a
//// g = [1, 2, 3]
//// g[0[|/*marker9a*/|]][|/*marker9b*/|] =[|/*marker9c*/|] h =[|/*marker9d*/|] g[2[|/*marker9e*/|]][|/*marker9f*/|] =[|/*marker9g*/|] h =[|/*marker9h*/|] g[1[|/*marker9i*/|]][|/*marker9j*/|]
//// i: C = {"a": 2, "b": 1.2}
//// i[[|/*marker10a*/"b"|]] [|/*marker10b*/=|] i[[|/*marker10c*/"a"|]][|/*marker10d*/|]
//// [|/*marker11a*/del|] i[[|/*marker11b*/"b"|]]
//// j: D | C = {[|/*marker12*/"a"|]: 2}
//// k = j[[|/*marker13a*/"a"|]][|/*marker13b*/|]
//// l = c[1:2[|/*marker14a*/|]][|/*marker14b*/|]
//// m = E["A"[|/*marker15a*/|]][|/*marker15b*/|]
//// n = "abc"[1[|/*marker16a*/|]][|/*marker16b*/|]
//// o = S0()[0:2[|/*marker17a*/|]][|/*marker17b*/|]

{
    const rangeMap = helper.getRangesByText();
    const docs = helper.markerDocumentRanges();

    helper.verifyFindDefinitions(
        {
            marker1: {
                definitions: rangeMap
                    .get('__radd__')!
                    .filter((r) => !r.marker)
                    .map((r) => helper.convertDocumentRange(r)),
            },
            marker2: { definitions: [docs.get('intAdd')!] },
            marker3: { definitions: [docs.get('intAdd')!] },
            marker4a: { definitions: [docs.get('intInvert')!] },
            marker4b: { definitions: [docs.get('intAnd')!] },
            marker5: { definitions: [docs.get('tupleRmul')!] },
            marker6: { definitions: [docs.get('tupleIn')!] },
            marker7a: { definitions: [docs.get('intLt')!] },
            marker7b: { definitions: [] },
            marker7c: { definitions: [docs.get('tupleGetItem')!] },
            marker8a: { definitions: [] },
            marker8b: { definitions: [docs.get('intBool')!] },
            marker9a: { definitions: [] },
            marker9b: { definitions: [docs.get('listSetItem')!] },
            marker9c: { definitions: [docs.get('listSetItem')!] },
            marker9d: { definitions: [] },
            marker9e: { definitions: [] },
            marker9f: { definitions: [docs.get('listSetItem')!] },
            marker9g: { definitions: [docs.get('listSetItem')!] },
            marker9h: { definitions: [] },
            marker9i: { definitions: [] },
            marker9j: { definitions: [docs.get('listGetItem')!] },
            marker10a: { definitions: [docs.get('Cb')!] },
            marker10b: { definitions: [docs.get('DictSetItem')!] },
            marker10c: { definitions: [docs.get('Ca')!] },
            marker10d: { definitions: [docs.get('DictGetItem')!] },
            marker11a: { definitions: [docs.get('DictDelItem')!] },
            marker11b: { definitions: [docs.get('Cb')!] },
            marker12: { definitions: [docs.get('Da')!, docs.get('Ca')!] },
            marker13a: { definitions: [docs.get('Da')!, docs.get('Ca')!] },
            marker13b: { definitions: [docs.get('DictGetItem')!] },
            marker14a: { definitions: [] },
            marker14b: { definitions: [docs.get('tupleGetItem')!] },
            marker15a: { definitions: [] },
            marker15b: { definitions: [docs.get('EnumGetItem')!] },
            marker16a: { definitions: [] },
            marker16b: { definitions: [docs.get('LitStrGetItem')!] },
            marker17a: { definitions: [] },
            marker17b: { definitions: [docs.get('S0GetItemSlice')!] },
        },
        'preferSource'
    );
}
