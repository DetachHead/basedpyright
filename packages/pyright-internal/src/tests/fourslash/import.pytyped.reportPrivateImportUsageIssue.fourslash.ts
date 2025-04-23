/// <reference path="typings/fourslash.d.ts" />

// @filename: pyrightconfig.json
//// {
////   "reportPrivateImportUsage": "error"
//// }

// @filename: a/py.typed
// @library: true
////

// @filename: a/__init__.py
// @library: true
//// from ._b import C as C

// @filename: a/_b.py
// @library: true
//// class C: ...
//// class _D: ...

// repro of https://github.com/DetachHead/basedpyright/issues/1171
// the order of these two files matters! b/d.py must be evaluated first to reproduce it

// @filename: b/d.py
//// from a import [|/*marker2*/C|]

// @filename: b/c/main.py
//// from a._b import [|/*marker1*/_D|]

// this test is commented out because it's testing a fix for an upstream change that was since reverted.
// however it sounds like it will eventually be added back, in which case this test should be added back as well.
// see https://github.com/microsoft/pyright/pull/10322

// helper.openFiles(helper.getMarkers().map((m) => m.fileName));
// // https://github.com/DetachHead/basedpyright/issues/86
// // @ts-expect-error
// await helper.verifyDiagnostics({
//     marker1: {
//         category: 'error',
//         message: `"_D" is not exported from module "a._b"`,
//     },
//     marker2: {
//         category: 'hint',
//         message: `Import "C" is not accessed`,
//     },
// });
