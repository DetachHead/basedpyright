import { InlayHint, InlayHintLabelPart, InlayHintKind } from 'vscode-languageserver-protocol';
import { ProgramView } from '../common/extensibility';
import { convertOffsetToPosition } from '../common/positionUtils';

import { TypeInlayHintsWalker } from '../analyzer/typeInlayHintsWalker';
import { Range } from 'vscode-languageserver-types';
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

        return this._walker.featureItems.map((item) => ({
            label: [InlayHintLabelPart.create(item.value)],
            position: convertOffsetToPosition(item.position, parseResults.tokenizerOutput.lines),
            paddingLeft: item.inlayHintType === 'functionReturn',
            kind: item.inlayHintType === 'parameter' ? InlayHintKind.Parameter : InlayHintKind.Type,
            textEdits: item.imports
                ? Array.from(item.imports).flatMap((import_) => {
                      let nameToImport: string | undefined;
                      let importFrom: string;
                      if (Array.isArray(import_)) {
                          [importFrom, nameToImport] = import_;
                      } else {
                          importFrom = import_;
                      }
                      const result = this._autoImporter?.getTextEditsForAutoImportByFilePath(
                          { name: nameToImport },
                          { name: importFrom },
                          nameToImport ?? importFrom,
                          ImportGroup.BuiltIn, // TODO: figure out the correct import group
                          this._program.importResolver.resolveImport(
                              this._fileUri,
                              this._program.configOptions.findExecEnvironment(this._fileUri),
                              {
                                  nameParts: importFrom.split('.'),
                                  importedSymbols: nameToImport ? new Set([nameToImport]) : undefined,
                                  leadingDots: 0,
                              }
                          ).resolvedUris[0]
                      );
                      return result?.edits ? convertToTextEdits(result.edits) : [];
                  })
                : [],
        }));
    }
}
