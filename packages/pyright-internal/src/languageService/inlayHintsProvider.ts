import { InlayHint, InlayHintLabelPart, InlayHintKind } from 'vscode-languageserver-protocol';
import { ProgramView } from '../common/extensibility';
import { convertOffsetToPosition } from '../common/positionUtils';

import { TypeInlayHintsWalker } from '../analyzer/typeInlayHintsWalker';
import { Range, TextEdit } from 'vscode-languageserver-types';
import { InlayHintSettings } from '../workspaceFactory';
import { ParseFileResults } from '../parser/parser';
import { AutoImporter } from './autoImporter';
import { ImportGroup } from '../analyzer/importStatementUtils';
import { Uri } from '../common/uri/uri';
import { convertToTextEdits } from '../common/workspaceEditUtils';

export class InlayHintsProvider {
    private readonly _walker: TypeInlayHintsWalker;

    constructor(
        private _program: ProgramView,
        private _fileUri: Uri,
        parseResults: ParseFileResults | undefined,
        private _autoImporter: AutoImporter | undefined,
        range: Range,
        inlayHintSettings: InlayHintSettings
    ) {
        this._walker = new TypeInlayHintsWalker(this._program, inlayHintSettings, parseResults, range);
    }

    async onInlayHints(): Promise<InlayHint[] | null> {
        const parseResults = this._walker.parseResults;
        if (!parseResults) {
            return null;
        }
        this._walker.walk(parseResults.parserOutput.parseTree);

        return this._walker.featureItems.map((item) => {
            const position = convertOffsetToPosition(item.position, parseResults.tokenizerOutput.lines);
            const textEdits: TextEdit[] = [{ newText: item.value, range: { start: position, end: position } }];
            if (item.imports) {
                for (const module of item.imports.imports) {
                    textEdits.push(...this._createTextEditsForImport(module, undefined));
                }
                for (const [module, names] of item.imports.importFroms) {
                    for (const name of names) {
                        textEdits.push(...this._createTextEditsForImport(module, name));
                    }
                }
            }
            return {
                label: [InlayHintLabelPart.create(item.value)],
                position,
                paddingLeft: item.inlayHintType === 'functionReturn',
                kind: item.inlayHintType === 'parameter' ? InlayHintKind.Parameter : InlayHintKind.Type,
                textEdits,
            };
        });
    }

    private _createTextEditsForImport = (module: string, name: string | undefined) => {
        const result = this._autoImporter?.getTextEditsForAutoImportByFilePath(
            { name },
            { name: module },
            name ?? module,
            ImportGroup.BuiltIn, // TODO: figure out the correct import group
            this._program.importResolver.resolveImport(
                this._fileUri,
                this._program.configOptions.findExecEnvironment(this._fileUri),
                {
                    nameParts: module.split('.'),
                    importedSymbols: name ? new Set([name]) : undefined,
                    leadingDots: 0,
                }
            ).resolvedUris[0]
        );
        return result?.edits ? convertToTextEdits(result.edits) : [];
    };
}
