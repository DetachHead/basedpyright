/// <reference path="typings/fourslash.d.ts" />

// method not overridden -> no supertypes (but prepare still fires for subtypes access)

// @filename: test.py
//// class S6Solo:
////     def /*marker6*/m6(self) -> None:
////         pass

{
    helper.verifyShowTypeHierarchyGetSupertypes({ marker6: { items: [] } });
}
