/// <reference path="typings/fourslash.d.ts" />

// class with no explicit base -> no supertypes (but prepare still fires for subtypes access)

// @filename: test.py
//// class /*marker1*/Standalone:
////     pass

{
    helper.verifyShowTypeHierarchyGetSupertypes({ marker1: { items: [] } });
}
