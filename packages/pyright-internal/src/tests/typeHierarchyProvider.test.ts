/*
 * typeHierarchyProvider.test.ts
 *
 * Tests for TypeHierarchyProvider focusing on:
 * - correctness of range vs selectionRange in returned items
 * - recursive traversal using selectionRange.start (as LSP clients do)
 */

import assert from 'assert';
import { CancellationToken } from 'vscode-languageserver';

import { Uri } from '../common/uri/uri';
import { TypeHierarchyProvider } from '../languageService/typeHierarchyProvider';
import { parseAndGetTestState } from './harness/fourslash/testState';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeProvider(code: string, markerName: string) {
    const { state } = parseAndGetTestState(code);
    const marker = state.getMarkerByName(markerName);
    state.openFile(marker.fileName);
    const position = state.convertOffsetToPosition(marker.fileName, marker.position);
    const fileUri = Uri.file(marker.fileName, state.serviceProvider);
    const provider = new TypeHierarchyProvider(state.program, fileUri, position, CancellationToken.None);
    return { provider, state };
}

// ─── range vs selectionRange ──────────────────────────────────────────────────

test('supertypes method: selectionRange is name range', () => {
    // Verify selectionRange.start == selectionRange of "m1" name in Base
    const code = `
// @filename: test.py
//// class Base:
////     def [|m1|](self) -> None:
////         pass
//// class Child(Base):
////     def /*marker*/m1(self) -> None:
////         pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const items = provider.getSupertypes();

    assert.ok(items && items.length === 1, 'expected one supertype item');

    const rangeMap = state.getRangesByText();
    const expectedNameRange = state.convertPositionRange(rangeMap.get('m1')![0]);

    assert.deepStrictEqual(
        items[0].selectionRange,
        expectedNameRange,
        'selectionRange should be the name node range'
    );
});

test('supertypes class: selectionRange is name range', () => {
    const code = `
// @filename: test.py
//// class [|Base|]:
////     pass
//// class /*marker*/Child(Base):
////     pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const items = provider.getSupertypes();

    assert.ok(items && items.length === 1, 'expected one supertype item');

    const rangeMap = state.getRangesByText();
    const expectedNameRange = state.convertPositionRange(rangeMap.get('Base')![0]);

    assert.deepStrictEqual(
        items[0].selectionRange,
        expectedNameRange,
        'selectionRange should be the name node range'
    );
});

test('subtypes class: selectionRange is name range', () => {
    const code = `
// @filename: test.py
//// class /*marker*/Base:
////     pass
//// class [|Child|](Base):
////     pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const items = provider.getSubtypes();

    assert.ok(items && items.length === 1, 'expected one subtype item');

    const rangeMap = state.getRangesByText();
    const expectedNameRange = state.convertPositionRange(rangeMap.get('Child')![0]);

    assert.deepStrictEqual(
        items[0].selectionRange,
        expectedNameRange,
        'selectionRange should be the name node range'
    );
});

// ─── range should enclose the full declaration (currently failing = bug scope) ─

function posLe(a: { line: number; character: number }, b: { line: number; character: number }) {
    return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function rangeContains(
    outer: { start: { line: number; character: number }; end: { line: number; character: number } },
    inner: { start: { line: number; character: number }; end: { line: number; character: number } }
) {
    return posLe(outer.start, inner.start) && posLe(inner.end, outer.end);
}

test('supertypes method: range encloses full function, selectionRange is just the name', () => {
    const code = `
// @filename: test.py
//// class Base:
////     def m1(self) -> None:
////         pass
//// class Child(Base):
////     def /*marker*/m1(self) -> None:
////         pass
    `;
    const { provider } = makeProvider(code, 'marker');
    const items = provider.getSupertypes();

    assert.ok(items && items.length === 1);
    const { range, selectionRange } = items[0];

    assert.ok(rangeContains(range, selectionRange), `range ${JSON.stringify(range)} should contain selectionRange ${JSON.stringify(selectionRange)}`);
    // range must be strictly larger than selectionRange (covers function body, not just name)
    assert.ok(
        range.end.line > selectionRange.end.line ||
            (range.end.line === selectionRange.end.line && range.end.character > selectionRange.end.character),
        `range.end ${JSON.stringify(range.end)} should be after selectionRange.end ${JSON.stringify(selectionRange.end)}`
    );
});

test('supertypes class: range encloses full class body, selectionRange is just the name', () => {
    const code = `
// @filename: test.py
//// class Base:
////     x: int = 1
////     def foo(self) -> None:
////         pass
//// class /*marker*/Child(Base):
////     pass
    `;
    const { provider } = makeProvider(code, 'marker');
    const items = provider.getSupertypes();

    assert.ok(items && items.length === 1);
    const { range, selectionRange } = items[0];

    assert.ok(rangeContains(range, selectionRange), `range ${JSON.stringify(range)} should contain selectionRange ${JSON.stringify(selectionRange)}`);
    assert.ok(
        range.end.line > selectionRange.end.line ||
            (range.end.line === selectionRange.end.line && range.end.character > selectionRange.end.character),
        `range.end ${JSON.stringify(range.end)} should be after selectionRange.end ${JSON.stringify(selectionRange.end)}`
    );
});

test('subtypes method: range encloses full function, selectionRange is just the name', () => {
    const code = `
// @filename: test.py
//// class /*marker*/Base:
////     def m1(self) -> None:
////         pass
//// class Child(Base):
////     def m1(self) -> None:
////         pass
    `;
    const { provider } = makeProvider(code, 'marker');
    const items = provider.getSubtypes();

    assert.ok(items && items.length === 1);
    const { range, selectionRange } = items[0];

    assert.ok(rangeContains(range, selectionRange), `range ${JSON.stringify(range)} should contain selectionRange ${JSON.stringify(selectionRange)}`);
    assert.ok(
        range.end.line > selectionRange.end.line ||
            (range.end.line === selectionRange.end.line && range.end.character > selectionRange.end.character),
        `range.end ${JSON.stringify(range.end)} should be after selectionRange.end ${JSON.stringify(selectionRange.end)}`
    );
});

// ─── recursive traversal (simulates LSP client calling supertypes twice) ───────

test('supertypes method: selectionRange.start usable for recursive call (A→B→C)', () => {
    // C.m overrides B.m overrides A.m
    // First call: getSupertypes on C.m -> B.m item (selectionRange = "m" in B)
    // Second call: getSupertypes using B.m's selectionRange.start -> A.m item
    const code = `
// @filename: test.py
//// class A:
////     def m(self) -> None:
////         pass
//// class B(A):
////     def m(self) -> None:
////         pass
//// class C(B):
////     def /*marker*/m(self) -> None:
////         pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const firstItems = provider.getSupertypes();
    assert.ok(firstItems && firstItems.length === 1, 'first call should return B.m');

    const bItem = firstItems[0];
    assert.strictEqual(bItem.detail, 'B', 'first supertype should be B');

    // Simulate what the LSP client does: use selectionRange.start for next call
    const fileUri = Uri.parse(bItem.uri, state.serviceProvider);
    const secondProvider = new TypeHierarchyProvider(
        state.program,
        fileUri,
        bItem.selectionRange.start,
        CancellationToken.None
    );
    const secondItems = secondProvider.getSupertypes();
    assert.ok(secondItems && secondItems.length === 1, 'second call should return A.m');
    assert.strictEqual(secondItems[0].detail, 'A', 'second supertype should be A');
});

test('supertypes class: selectionRange.start usable for recursive call (A→B→C)', () => {
    // C extends B extends A
    // First call: getSupertypes on C -> B item
    // Second call: getSupertypes on B -> A item
    const code = `
// @filename: test.py
//// class A:
////     pass
//// class B(A):
////     pass
//// class /*marker*/C(B):
////     pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const firstItems = provider.getSupertypes();
    assert.ok(firstItems && firstItems.length === 1, 'first call should return B');

    const bItem = firstItems[0];
    assert.strictEqual(bItem.name, 'B', 'first supertype should be B');

    const fileUri = Uri.parse(bItem.uri, state.serviceProvider);
    const secondProvider = new TypeHierarchyProvider(
        state.program,
        fileUri,
        bItem.selectionRange.start,
        CancellationToken.None
    );
    const secondItems = secondProvider.getSupertypes();
    assert.ok(secondItems && secondItems.length === 1, 'second call should return A');
    assert.strictEqual(secondItems[0].name, 'A', 'second supertype should be A');
});

test('subtypes class: selectionRange.start usable for recursive call (A→B→C)', () => {
    // A has subclass B which has subclass C
    // First call: getSubtypes on A -> B item
    // Second call: getSubtypes using B's selectionRange.start -> C item
    const code = `
// @filename: test.py
//// class /*marker*/A:
////     pass
//// class B(A):
////     pass
//// class C(B):
////     pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const firstItems = provider.getSubtypes();
    assert.ok(firstItems && firstItems.length === 1, 'first call should return B');

    const bItem = firstItems[0];
    assert.strictEqual(bItem.name, 'B', 'first subtype should be B');

    const fileUri = Uri.parse(bItem.uri, state.serviceProvider);
    const secondProvider = new TypeHierarchyProvider(
        state.program,
        fileUri,
        bItem.selectionRange.start,
        CancellationToken.None
    );
    const secondItems = secondProvider.getSubtypes();
    assert.ok(secondItems && secondItems.length === 1, 'second call should return C');
    assert.strictEqual(secondItems[0].name, 'C', 'second subtype should be C');
});

test('subtypes method: selectionRange.start usable for recursive call', () => {
    // Base.m -> Child.m -> GrandChild.m
    // First call: subtypes of Base.m -> Child.m item
    // Second call: subtypes of Child.m -> GrandChild.m item
    const code = `
// @filename: test.py
//// class Base:
////     def /*marker*/m(self) -> None:
////         pass
//// class Child(Base):
////     def m(self) -> None:
////         pass
//// class GrandChild(Child):
////     def m(self) -> None:
////         pass
    `;
    const { provider, state } = makeProvider(code, 'marker');
    const firstItems = provider.getSubtypes();
    assert.ok(firstItems && firstItems.length === 1, 'first call should return Child.m');

    const childItem = firstItems[0];
    assert.strictEqual(childItem.detail, 'Child', 'first subtype should be Child');

    const fileUri = Uri.parse(childItem.uri, state.serviceProvider);
    const secondProvider = new TypeHierarchyProvider(
        state.program,
        fileUri,
        childItem.selectionRange.start,
        CancellationToken.None
    );
    const secondItems = secondProvider.getSubtypes();
    assert.ok(secondItems && secondItems.length === 1, 'second call should return GrandChild.m');
    assert.strictEqual(secondItems[0].detail, 'GrandChild', 'second subtype should be GrandChild');
});
