/// <reference path="typings/fourslash.d.ts" />

// @filename: class_test.py
//// from typing import Any
////
////
//// class [|/*marker*/Foo|]:
////     ...
////
////
//// class Baz(Any):  # Any alone doesn't qualify as implementation
////     ...
////
////
//// class [|Bar|](Foo, Any):
////     ...
////
////
//// class Qux(Baz):
////     ...
////
////
//// class [|Spam|](Bar):
////     ...

{
    const ranges = helper.getRanges();

    helper.verifyFindAllImplementations({
        marker: {
            implementations: ranges.map((r) => {
                return { path: r.fileName, range: helper.convertPositionRange(r) };
            }),
        },
    });
}
