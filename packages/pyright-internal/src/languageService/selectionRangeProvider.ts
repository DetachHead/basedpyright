/*
 * selectionRangeProvider.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Provides syntax-aware selection ranges for a Python document.
 */

import { CancellationToken, SelectionRange } from 'vscode-languageserver';

import { findNodeByOffset, getAncestorsIncludingSelf } from '../analyzer/parseTreeUtils';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { ProgramView } from '../common/extensibility';
import { convertPositionToOffset, convertTextRangeToRange } from '../common/positionUtils';
import { Position, TextRange } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { improveNodeByOffset, nodeRange } from '../parser/parseNodeUtils';

export class SelectionRangeProvider {
    constructor(
        private readonly _program: ProgramView,
        private readonly _fileUri: Uri,
        private readonly _positions: Position[],
        private readonly _token: CancellationToken
    ) {}

    getSelectionRanges(): SelectionRange[] | undefined {
        throwIfCancellationRequested(this._token);

        const parseResults = this._program.getParseResults(this._fileUri);
        if (!parseResults) {
            return undefined;
        }

        const parseTree = parseResults.parserOutput.parseTree;
        const lines = parseResults.tokenizerOutput.lines;
        const results: SelectionRange[] = [];

        for (const position of this._positions) {
            throwIfCancellationRequested(this._token);

            const offset = convertPositionToOffset(position, lines);
            if (offset === undefined) {
                return undefined;
            }

            const node = findNodeByOffset(parseTree, offset);
            if (!node) {
                return undefined;
            }

            const ranges: TextRange[] = [];
            for (const ancestor of getAncestorsIncludingSelf(improveNodeByOffset(node, offset))) {
                const range = nodeRange(ancestor);
                const previousRange = ranges[ranges.length - 1];
                if (
                    range.length === 0 ||
                    (previousRange &&
                        (!TextRange.containsRange(range, previousRange) ||
                            (range.start === previousRange.start && range.length === previousRange.length)))
                ) {
                    continue;
                }

                ranges.push(range);
            }

            let selectionRange: SelectionRange | undefined;
            for (let i = ranges.length - 1; i >= 0; i--) {
                selectionRange = {
                    range: convertTextRangeToRange(ranges[i], lines),
                    parent: selectionRange,
                };
            }

            if (!selectionRange) {
                return undefined;
            }

            results.push(selectionRange);
        }

        return results;
    }
}
