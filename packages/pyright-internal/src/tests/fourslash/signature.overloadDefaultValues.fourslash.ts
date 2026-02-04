/// <reference path="typings/fourslash.d.ts" />

// @filename: foo.py
//// from typing import overload
////
//// @overload
//// def foo(value: int = ...) -> int: ...
////
//// @overload
//// def foo(value: str) -> str: ...
////
//// def foo(value: int | str = 0) -> int | str: ...
//// foo([|/*s1*/|]

{
    helper.verifySignature('plaintext', {
        s1: {
            signatures: [
                {
                    label: '(value: int = 0) -> int',
                    parameters: ['value: int = 0'],
                },
                {
                    label: '(value: str) -> str',
                    parameters: ['value: str'],
                },
            ],
            activeParameters: [0, 0],
        },
    });
}
