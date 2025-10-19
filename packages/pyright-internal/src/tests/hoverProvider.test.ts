/*
 * hoverProvider.test.ts
 *
 * hoverProvider tests.
 */

import { parseAndGetTestState } from './harness/fourslash/testState';

test('import tooltip - import statement', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import [|/*marker1*/matplotlib|].[|/*marker2*/pyplot|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(module) matplotlib\n```\n---\nmatplotlib',
        marker2: '```python\n(module) pyplot\n```\n---\npyplot',
    });
});

test('import tooltip - import reference', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib.pyplot
//// [|/*marker1*/matplotlib|].[|/*marker2*/pyplot|]

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(module) matplotlib\n```\n---\nmatplotlib',
        marker2: '```python\n(module) pyplot\n```\n---\npyplot',
    });
});

test('import tooltip - import statement with stubs', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import [|/*marker1*/matplotlib|].[|/*marker2*/pyplot|]

// @filename: matplotlib/__init__.pyi
// @library: true
//// # empty

// @filename: matplotlib/pyplot.pyi
// @library: true
//// # empty

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(module) matplotlib\n```\n---\nmatplotlib',
        marker2: '```python\n(module) pyplot\n```\n---\npyplot',
    });
});

test('import tooltip - import reference - stub files', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import matplotlib.pyplot
//// [|/*marker1*/matplotlib|].[|/*marker2*/pyplot|]

// @filename: matplotlib/__init__.pyi
// @library: true
//// # empty

// @filename: matplotlib/pyplot.pyi
// @library: true
//// # empty

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(module) matplotlib\n```\n---\nmatplotlib',
        marker2: '```python\n(module) pyplot\n```\n---\npyplot',
    });
});

test('import tooltip - import submodules statement', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import A.B.[|/*marker*/C|]

// @filename: A/__init__.py
// @library: true
//// # empty

// @filename: A/B/__init__.py
// @library: true
//// # empty

// @filename: A/B/C/__init__.py
// @library: true
//// """ C """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    state.verifyHover('markdown', { marker: '```python\n(module) C\n```\n---\nC' });
});

test('import tooltip - import submodules reference', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// import A.B.C
//// A.B.[|/*marker*/C|]

// @filename: A/__init__.py
// @library: true
//// # empty

// @filename: A/B/__init__.py
// @library: true
//// # empty

// @filename: A/B/C/__init__.py
// @library: true
//// """ C """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    state.verifyHover('markdown', { marker: '```python\n(module) C\n```\n---\nC' });
});

test('import tooltip - from import statement with stubs', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from [|/*marker1*/matplotlib|].[|/*marker2*/pyplot|] import *

// @filename: matplotlib/__init__.pyi
// @library: true
//// # empty

// @filename: matplotlib/pyplot.pyi
// @library: true
//// # empty

// @filename: matplotlib/__init__.py
// @library: true
//// """ matplotlib """

// @filename: matplotlib/pyplot.py
// @library: true
//// """ pyplot """
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(module) matplotlib\n```\n---\nmatplotlib',
        marker2: '```python\n(module) pyplot\n```\n---\npyplot',
    });
});

test('import tooltip - from import submodules statement', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from A.B.[|/*marker*/C|] import *

// @filename: A/__init__.py
// @library: true
//// # empty

// @filename: A/B/__init__.py
// @library: true
//// # empty

// @filename: A/B/C/__init__.py
// @library: true
//// """ C """
    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    state.verifyHover('markdown', { marker: '```python\n(module) C\n```\n---\nC' });
});

test('import tooltip - check duplicate property', async () => {
    const code = `

// @filename: test.py
//// class Test:
////     def __init__(self) -> None:
////         self.__test = False
//// 
////     @property
////     def [|/*marker*/test|](self):
////         """Test DocString.
//// 
////         Returns
////         -------
////         bool
////             Lorem Ipsum
////         """
////         return self.__test

    `;

    const state = parseAndGetTestState(code).state;
    const marker = state.getMarkerByName('marker');
    state.openFile(marker.fileName);

    state.verifyHover('markdown', {
        marker: '```python\n(property) test: (self: Self@Test) -> bool\n```\n---\nTest DocString.\n\nReturns\n-------\nbool  \n&nbsp;&nbsp;&nbsp;&nbsp;Lorem Ipsum',
    });
});

test('import symbol tooltip - useLibraryCodeForTypes false', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": false
//// }

// @filename: test.py
//// from foo import [|/*marker1*/bar|]
//// from bar.baz1 import [|/*marker2*/baz2|]

// @filename: foo/__init__.py
// @library: true
//// from .bar import bar

// @filename: foo/bar.py
// @library: true
//// class bar: ...

// @filename: bar/baz1/baz2/__init__.py
// @library: true
//// class baz: ...
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(import) bar: Unknown\n```',
        marker2: '```python\n(module) baz2\n```',
    });
});

test('import symbol tooltip - useLibraryCodeForTypes true', async () => {
    const code = `
// @filename: pyrightconfig.json
//// {
////   "useLibraryCodeForTypes": true
//// }

// @filename: test.py
//// from foo import [|/*marker1*/bar|]

// @filename: foo/__init__.py
// @library: true
//// from .bar import bar

// @filename: foo/bar.py
// @library: true
//// class bar: ...
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(class) bar\n```',
    });
});

test('TypedDict doc string', async () => {
    const code = `
// @filename: test.py
//// from typing import [|/*marker*/TypedDict|]

// @filename: typing.py
// @library: true
//// def TypedDict(typename, fields=None, /, *, total=True, **kwargs):
////     """A simple typed namespace. At runtime it is equivalent to a plain dict."""
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker');
    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker: '```python\n(class) TypedDict\n```\n---\nA simple typed namespace. At runtime it is equivalent to a plain dict.',
    });
});

test('hover on class Foo and its __call__ method with overloads', async () => {
    const code = `
// @filename: test.py
//// from typing import overload
//// class Foo:
////     def __init__(self):
////         pass
////
////     @overload
////     def __call__(self, a: int) -> int: pass
////     @overload
////     def __call__(self, a: str) -> str: pass
////     def __call__(self, a: int | str) ->  int | str:
////         return a   
////
//// [|/*marker1*/foo|] = Foo()
//// [|/*marker2*/foo|](1)
//// [|/*marker3*/foo|]("hello")
//// [|/*marker4*/foo|]()
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');

    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(variable) foo: Foo\n```',
        marker2: '```python\n(variable) def foo(a: int) -> int\n```',
        marker3: '```python\n(variable) def foo(a: str) -> str\n```',
        marker4: '```python\n(variable)\ndef __call__(a: int) -> int: ...\ndef __call__(a: str) -> str: ...\n```',
    });
});

test('hover on __call__ method', async () => {
    const code = `
// @filename: test.py
//// class Foo:
////     def __init__(self):
////         pass
////
////     def __call__(self, a: int) -> int:
////         return a   
////
//// [|/*marker1*/foo|] = Foo()
//// [|/*marker2*/foo|](1)
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');

    state.openFile(marker1.fileName);

    state.verifyHover('markdown', {
        marker1: '```python\n(variable) foo: Foo\n```',
        marker2: '```python\n(variable) def foo(a: int) -> int\n```',
    });
});

test('hover on operators', async () => {
    const code = `
// @filename: test.py
//// class A:
////     pass
//// class B:
////     def __radd__(self, lhs: A) -> "B":
////         return B()
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
//// from typing import NotRequired, TypedDict
//// class C(TypedDict): a: int; b: NotRequired[float]
//// i: C = {"a": 2, "b": 1.2}
//// i[[|/*marker15*/"b"|]] = i[[|/*marker16*/"a"|]]
//// del i[[|/*marker17*/"b"|]]
//// class D(TypedDict):
////     a: int
////     """an integer"""
////     b: NotRequired[float]
//// j: D | C = {[|/*marker18*/"a"|]: 2}
//// k = j[[|/*marker19*/"a"|]]
//// l = c[[|/*marker20*/1:2|]]
//// from enum import Enum
//// class E(Enum): A = 1; B = 2
//// m = E[[|/*marker21*/"A"|]]
//// n = "abc"[[|/*marker22*/1|]]
    `;

    const state = parseAndGetTestState(code).state;
    const marker1 = state.getMarkerByName('marker1');

    state.openFile(marker1.fileName);

    state.verifyHoverRanges('markdown', {
        marker1: [
            '```python\n(method) def __radd__(self: Self@B, lhs: A) -> B\n```',
            { start: { line: 5, character: 0 }, end: { line: 5, character: 9 } },
        ],
        marker2: [
            '```python\n(method) def __add__(self: Self@int, value: int, /) -> int\n```',
            { start: { line: 6, character: 4 }, end: { line: 6, character: 9 } },
        ],
        marker3: [
            '```python\n(method) def __add__(self: Self@int, value: int, /) -> int\n```',
            { start: { line: 7, character: 0 }, end: { line: 7, character: 6 } },
        ],
        marker4: [
            '```python\n(method) def __invert__(self: Self@int) -> int\n```',
            { start: { line: 8, character: 5 }, end: { line: 8, character: 7 } },
        ],
        marker6: [
            '```python\n(method) def __rmul__(self: Self@tuple[_T_co@tuple], value: SupportsIndex, /) -> tuple[_T_co@tuple, ...]\n```',
            { start: { line: 9, character: 4 }, end: { line: 9, character: 9 } },
        ],
        marker7: [
            '```python\n(method) def __contains__(self: Self@tuple[_T_co@tuple], key: object, /) -> bool\n```',
            { start: { line: 10, character: 4 }, end: { line: 10, character: 14 } },
        ],
        marker8: [
            '```python\n(method) def __lt__(self: Self@int, value: int, /) -> bool\n```',
            { start: { line: 11, character: 4 }, end: { line: 11, character: 12 } },
        ],
        marker9: [
            '```python\n(method) def __getitem__(self: Self@tuple[_T_co@tuple], key: SupportsIndex, /) -> _T_co@tuple\n```',
            { start: { line: 11, character: 8 }, end: { line: 11, character: 12 } },
        ],
        marker10: null,
        marker11: [
            '```python\n(method) def __bool__(self: Self@int) -> bool\n```',
            { start: { line: 12, character: 9 }, end: { line: 12, character: 14 } },
        ],
        marker12: [
            '```python\n(method) def __setitem__(self: Self@list[_T@list], key: SupportsIndex, value: _T@list, /) -> None\n```',
            { start: { line: 14, character: 0 }, end: { line: 14, character: 26 } },
        ],
        marker13: [
            '```python\n(method) def __setitem__(self: Self@list[_T@list], key: SupportsIndex, value: _T@list, /) -> None\n```',
            { start: { line: 14, character: 11 }, end: { line: 14, character: 26 } },
        ],
        marker14: [
            '```python\n(method) def __getitem__(self: Self@list[_T@list], i: SupportsIndex, /) -> _T@list\n```',
            { start: { line: 14, character: 22 }, end: { line: 14, character: 26 } },
        ],
        marker15: [
            '```python\n(variable) b: float\n```\n\n\n---\n```python\n(method) def __setitem__(self: Self@dict[_KT@dict, _VT@dict], key: _KT@dict, value: _VT@dict, /) -> None\n```',
            { start: { line: 18, character: 0 }, end: { line: 18, character: 15 } },
        ],
        marker16: [
            '```python\n(variable) a: int\n```\n\n\n---\n```python\n(method) def __getitem__(self: Self@dict[_KT@dict, _VT@dict], key: _KT@dict, /) -> _VT@dict\n```',
            { start: { line: 18, character: 9 }, end: { line: 18, character: 15 } },
        ],
        marker17: [
            '```python\n(variable) b: float\n```\n\n\n---\n```python\n(method) def __delitem__(self: Self@dict[_KT@dict, _VT@dict], key: _KT@dict, /) -> None\n```',
            { start: { line: 19, character: 0 }, end: { line: 19, character: 10 } },
        ],
        marker18: [
            '```python\n(key) a: int\n```\n---\nan integer\n\n---\n```python\n(key) a: int\n```',
            { start: { line: 24, character: 12 }, end: { line: 24, character: 15 } },
        ],
        marker19: [
            '```python\n(variable) a: int\n```\n---\nan integer\n\n---\n```python\n(method) def __getitem__(self: Self@dict[_KT@dict, _VT@dict], key: _KT@dict, /) -> _VT@dict\n```\n\n\n---\n```python\n(variable) a: int\n```\n\n\n---\n```python\n(method) def __getitem__(self: Self@dict[_KT@dict, _VT@dict], key: _KT@dict, /) -> _VT@dict\n```',
            { start: { line: 25, character: 4 }, end: { line: 25, character: 10 } },
        ],
        marker20: [
            '```python\n(method) def __getitem__(self: Self@tuple[_T_co@tuple], key: slice[Any, Any, Any], /) -> tuple[_T_co@tuple, ...]\n```',
            { start: { line: 26, character: 4 }, end: { line: 26, character: 10 } },
        ],
        marker21: [
            '```python\n(method) def __getitem__(self: type[_EnumMemberT@__getitem__], name: str) -> _EnumMemberT@__getitem__\n```',
            { start: { line: 29, character: 4 }, end: { line: 29, character: 10 } },
        ],
        marker22: [
            '```python\n(method) def __getitem__(self: LiteralString, key: SupportsIndex | slice[Any, Any, Any], /) -> LiteralString\n```',
            { start: { line: 30, character: 4 }, end: { line: 30, character: 12 } },
        ],
    });
});
