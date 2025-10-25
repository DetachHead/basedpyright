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
////     [|/*Db*/b|]: NotRequired[float]
////
////
//// class E(Enum):
////     [|/*EA*/A|] = 1
////     [|/*EB*/B|] = 2

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
////
//// A() [|/*marker1*/+|] B()
//// a = 1 [|/*marker2*/+|] 2
//// a [|/*marker3*/+=|] 3
//// b = ([|/*marker4*/~|]a [|/*marker5*/&|] 255,)
//// c = 4 [|/*marker6*/*|] b
//// d = 5 [|/*marker7*/not|] in c
//// e = a [|/*marker8*/<|] b[[|/*marker9*/0|]]
//// f = e [|/*marker10*/or|] [|/*marker11*/not|] a
//// g = [1, 2, 3]
//// g[[|/*marker12*/0|]] = h = g[[|/*marker13*/2|]] = h = g[[|/*marker14*/1|]]
//// i: C = {"a": 2, "b": 1.2}
//// i[[|/*marker15*/"b"|]] = i[[|/*marker16*/"a"|]]
//// del i[[|/*marker17*/"b"|]]
//// j: D | C = {[|/*marker18*/"a"|]: 2}
//// k = j[[|/*marker19*/"a"|]]
//// l = c[[|/*marker20*/1:2|]]
//// m = E[[|/*marker21*/"A"|]]
//// n = "abc"[[|/*marker22*/1|]]

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
            marker4: { definitions: [nameToDoc('intInvert')] },
            marker5: { definitions: [nameToDoc('intAnd')] },
            marker6: { definitions: [nameToDoc('tupleRmul')] },
            marker7: { definitions: [nameToDoc('tupleIn')] },
            marker8: { definitions: [nameToDoc('intLt')] },
            marker9: { definitions: [nameToDoc('tupleGetItem')] },
            marker10: { definitions: [] },
            marker11: { definitions: [nameToDoc('intBool')] },
            marker12: { definitions: [nameToDoc('listSetItem')] },
            marker13: { definitions: [nameToDoc('listSetItem')] },
            marker14: { definitions: [nameToDoc('listGetItem')] },
            marker15: { definitions: [nameToDoc('Cb'), nameToDoc('DictSetItem')] },
            marker16: { definitions: [nameToDoc('Ca'), nameToDoc('DictGetItem')] },
            marker17: { definitions: [nameToDoc('Cb'), nameToDoc('DictDelItem')] },
            marker18: { definitions: [nameToDoc('Da'), nameToDoc('Ca')] },
            marker19: { definitions: [nameToDoc('DictGetItem'), nameToDoc('Da'), nameToDoc('Ca')] },
            marker20: { definitions: [nameToDoc('tupleGetItem')] },
            marker21: { definitions: [nameToDoc('EnumGetItem')] },
            marker22: { definitions: [nameToDoc('LitStrGetItem')] },
        },
        'preferSource'
    );
}
