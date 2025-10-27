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
//// e = a [|/*marker7a*/<|] b[[|/*marker7b*/0|]]
//// f = e [|/*marker8a*/or|] [|/*marker8b*/not|] a
//// g = [1, 2, 3]
//// g[[|/*marker9a*/0|]] [|/*marker9b*/=|] h [|/*marker9c*/=|] g[[|/*marker9d*/2|]] [|/*marker9e*/=|] h [|/*marker9f*/=|] g[[|/*marker9g*/1|]]
//// i: C = {"a": 2, "b": 1.2}
//// i[[|/*marker10a*/"b"|]] [|/*marker10b*/=|] i[[|/*marker10c*/"a"|]][|/*marker10d*/|]
//// [|/*marker11a*/del|] i[[|/*marker11b*/"b"|]]
//// j: D | C = {[|/*marker12*/"a"|]: 2}
//// k = j[[|/*marker13a*/"a"|]][|/*marker13b*/|]
//// l = c[[|/*marker14*/1:2|]]
//// m = E[[|/*marker15*/"A"|]]
//// n = "abc"[[|/*marker16*/1|]]
//// o = S0()[[|/*marker17*/0:2|]]

{
    const rangeMap = helper.getRangesByText();
    const namedRanges = new Map(
        helper
            .getRanges()
            .filter((range) => range.marker)
            .map((range) => [helper.getMarkerName(range.marker!), range])
    );

    const rangeToDoc = (r: _.Range): _.DocumentRange => {
        return { path: r.fileName, range: helper.convertPositionRange(r) };
    };
    const nameToDoc = (name: string): _.DocumentRange => {
        return rangeToDoc(namedRanges.get(name)!);
    };

    helper.verifyFindDefinitions(
        {
            marker1: {
                definitions: rangeMap
                    .get('__radd__')!
                    .filter((r) => !r.marker)
                    .map(rangeToDoc),
            },
            marker2: { definitions: [nameToDoc('intAdd')] },
            marker3: { definitions: [nameToDoc('intAdd')] },
            marker4a: { definitions: [nameToDoc('intInvert')] },
            marker4b: { definitions: [nameToDoc('intAnd')] },
            marker5: { definitions: [nameToDoc('tupleRmul')] },
            marker6: { definitions: [nameToDoc('tupleIn')] },
            marker7a: { definitions: [nameToDoc('intLt')] },
            marker7b: { definitions: [nameToDoc('tupleGetItem')] },
            marker8a: { definitions: [] },
            marker8b: { definitions: [nameToDoc('intBool')] },
            marker9a: { definitions: [nameToDoc('listSetItem')] },
            marker9b: { definitions: [nameToDoc('listSetItem')] },
            marker9c: { definitions: [] },
            marker9d: { definitions: [nameToDoc('listSetItem')] },
            marker9e: { definitions: [nameToDoc('listSetItem')] },
            marker9f: { definitions: [] },
            marker9g: { definitions: [nameToDoc('listGetItem')] },
            marker10a: { definitions: [nameToDoc('Cb')] },
            marker10b: { definitions: [nameToDoc('DictSetItem')] },
            marker10c: { definitions: [nameToDoc('Ca')] },
            marker10d: { definitions: [nameToDoc('DictGetItem')] },
            marker11a: { definitions: [nameToDoc('DictDelItem')] },
            marker11b: { definitions: [nameToDoc('Cb')] },
            marker12: { definitions: [nameToDoc('Da'), nameToDoc('Ca')] },
            marker13a: { definitions: [nameToDoc('Da'), nameToDoc('Ca')] },
            marker13b: { definitions: [nameToDoc('DictGetItem')] },
            marker14: { definitions: [nameToDoc('tupleGetItem')] },
            marker15: { definitions: [nameToDoc('EnumGetItem')] },
            marker16: { definitions: [nameToDoc('LitStrGetItem')] },
            marker17: { definitions: [nameToDoc('S0GetItemSlice')] },
        },
        'preferSource'
    );
}
