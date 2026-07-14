/*
 * selectionRangeProvider.test.ts
 *
 * Tests for syntax-aware selection ranges.
 */

import assert from 'assert';
import { CancellationToken, SelectionRange } from 'vscode-languageserver';

import { convertOffsetToPosition } from '../common/positionUtils';
import { rangesAreEqual } from '../common/textRange';
import { SelectionRangeProvider } from '../languageService/selectionRangeProvider';
import { parseAndGetTestState } from './harness/fourslash/testState';

test('includes enclosing function and class ranges', () => {
    const code = `
//// class Pricing:
////     async def create_default_pricing_tables():/*header*/
////         value = 1
////         return /*body*/value
////
//// outside = 2
    `;
    const state = parseAndGetTestState(code).state;

    for (const markerName of ['header', 'body']) {
        const marker = state.getMarkerByName(markerName);
        state.openFile(marker.fileName);
        const lines = state.program.getParseResults(marker.fileUri)!.tokenizerOutput.lines;

        const result = new SelectionRangeProvider(
            state.program,
            marker.fileUri,
            [convertOffsetToPosition(marker.position, lines)],
            CancellationToken.None
        ).getSelectionRanges();

        assert(result);
        const ranges = flattenRanges(result[0]);
        assert(
            ranges.some(
                (range) =>
                    range.start.line === 1 &&
                    range.start.character === 4 &&
                    range.end.line === 3 &&
                    range.end.character === 20
            ),
            'Expected the method range'
        );
        assert(
            ranges.some(
                (range) =>
                    range.start.line === 0 &&
                    range.start.character === 0 &&
                    range.end.line === 3 &&
                    range.end.character === 20
            ),
            'Expected the class range'
        );
        assert(
            ranges.some((range) => range.start.line === 0 && range.start.character === 0 && range.end.line === 5),
            'Expected the module range'
        );
    }
});

test('returns one hierarchy for each requested position', () => {
    const code = `
//// def first():/*first*/
////     pass
////
//// def second():/*second*/
////     pass
    `;
    const state = parseAndGetTestState(code).state;
    const first = state.getMarkerByName('first');
    const second = state.getMarkerByName('second');
    state.openFile(first.fileName);
    const lines = state.program.getParseResults(first.fileUri)!.tokenizerOutput.lines;

    const result = new SelectionRangeProvider(
        state.program,
        first.fileUri,
        [convertOffsetToPosition(first.position, lines), convertOffsetToPosition(second.position, lines)],
        CancellationToken.None
    ).getSelectionRanges();

    assert(result);
    assert.strictEqual(result.length, 2);
    assert(!rangesAreEqual(result[0].range, result[1].range));
});

function flattenRanges(selectionRange: SelectionRange) {
    const ranges = [];
    let current: SelectionRange | undefined = selectionRange;
    while (current) {
        ranges.push(current.range);
        current = current.parent;
    }
    return ranges;
}
