/// <reference path="typings/fourslash.d.ts" />

// child class does not override the method -> no subtypes

// @filename: test.py
//// class Base:
////     def /*marker1*/m1(self) -> None:
////         pass
//// class Child(Base):
////     pass

{
    helper.verifyShowTypeHierarchyGetSubtypes({ marker1: { items: [] } });
}
