import { InlayHint, InlayHintKind } from 'vscode-languageserver-protocol';
import { ProgramView } from '../common/extensibility';
import { convertOffsetToPosition } from '../common/positionUtils';

import { TypeInlayHintsWalker } from '../analyzer/typeInlayHintsWalker';
import { Range, TextEdit } from 'vscode-languageserver-types';
import { InlayHintSettings } from '../workspaceFactory';
import { AutoImporter } from './autoImporter';
import { ImportGroup } from '../analyzer/importStatementUtils';
import { Uri } from '../common/uri/uri';
import { convertToTextEdits } from '../common/workspaceEditUtils';

export class InlayHintsProvider {
    private readonly _walker: TypeInlayHintsWalker;

    constructor(
        private _program: ProgramView,
        private _fileUri: Uri,
        private _autoImporter: AutoImporter | undefined,
        range: Range,
        inlayHintSettings: InlayHintSettings
    ) {
        this._walker = new TypeInlayHintsWalker(this._program, inlayHintSettings, _fileUri, range);
    }

    async onInlayHints(): Promise<InlayHint[] | null> {
        const parseResults = this._walker.parseResults;
        if (!parseResults) {
            return null;
        }
        this._walker.walk(parseResults.parserOutput.parseTree);

        return this._walker.featureItems.map((item) => {
            const position = convertOffsetToPosition(item.position, parseResults.tokenizerOutput.lines);
            const paddingLeft = item.inlayHintType === 'functionReturn';
            const textEdits: TextEdit[] = [
                { newText: `${paddingLeft ? ' ' : ''}${item.value}`, range: { start: position, end: position } },
            ];
            if (item.imports) {
                for (const module of item.imports.imports) {
                    textEdits.push(...this._createTextEditsForImport(module, new Set()));
                }
                for (const [module, names] of item.imports.importFroms) {
                    textEdits.push(...this._createTextEditsForImport(module, names));
                }
            }
            return {
                label: item.value,
                position,
                paddingLeft,
                kind: item.inlayHintType === 'parameter' ? InlayHintKind.Parameter : InlayHintKind.Type,
                textEdits,
            };
        });
    }

    private _createTextEditsForImport = (module: string, names: ReadonlySet<string>) => {
        const result = this._autoImporter?.getTextEditsForMultipleAutoImport(
            Array.from(names).map((name) => ({ name })),
            { name: module },
            ImportGroup.BuiltIn, // TODO: figure out the correct import group
            // if an import isn't resolved, then it's probably a notebook cell
            this._program.importResolver.resolveImport(
                this._fileUri,
                this._program.configOptions.findExecEnvironment(this._fileUri),
                {
                    nameParts: module.split('.'),
                    importedSymbols: names,
                    leadingDots: 0,
                }
            ).resolvedUris[0]
        );
        return convertToTextEdits(result ?? []);
    };
}
