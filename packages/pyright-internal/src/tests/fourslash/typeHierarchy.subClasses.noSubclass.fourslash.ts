/// <reference path="typings/fourslash.d.ts" />

// class with no subclasses -> no subtypes

// @filename: test.py
//// class Base:
////     pass
//// class /*marker1*/Leaf(Base):
////     pass

{
    helper.verifyShowTypeHierarchyGetSubtypes({ marker1: { items: [] } });
}
