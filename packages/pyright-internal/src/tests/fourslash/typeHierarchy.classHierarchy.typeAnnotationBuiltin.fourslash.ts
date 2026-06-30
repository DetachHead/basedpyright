/// <reference path="typings/fourslash.d.ts" />

// cursor on a builtin type in an annotation -> no hierarchy (filtered out)

// @filename: test.py
//// x: /*marker*/int

{
    helper.verifyShowTypeHierarchyGetSupertypes({ marker: null });
}
