import { InlayHint, InlayHintLabelPart, InlayHintKind } from 'vscode-languageserver-protocol';
import { ProgramView } from '../common/extensibility';
import { convertOffsetToPosition } from '../common/positionUtils';

import { TypeInlayHintsWalker } from '../analyzer/typeInlayHintsWalker';
import { Uri } from '../common/uri/uri';
import { Range } from 'vscode-languageserver-types';

export class InlayHintsProvider {
    private readonly _walker: TypeInlayHintsWalker;

    constructor(private _program: ProgramView, fileUri: Uri, range: Range) {
        this._walker = new TypeInlayHintsWalker(this._program, fileUri, range);
    }

    async onInlayHints(): Promise<InlayHint[] | null> {
        if (!this._walker.parseResults) {
            return null;
        }
        this._walker.walk(this._walker.parseResults.parserOutput.parseTree);

        return this._walker.featureItems.map((item) => ({
            label: [InlayHintLabelPart.create(item.value)],
            position: convertOffsetToPosition(item.position, this._walker.lines),
            paddingLeft: item.inlayHintType === 'functionReturn',
            kind: item.inlayHintType === 'parameter' ? InlayHintKind.Parameter : InlayHintKind.Type,
        }));
    }
}
