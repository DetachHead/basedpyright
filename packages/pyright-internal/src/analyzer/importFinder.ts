import { TextEdit } from 'vscode-languageserver-types';
import { Uri } from '../common/uri/uri';
import { ImportNode } from '../parser/parseNodes';
import { ParseTreeWalker } from './parseTreeWalker';
import { getImportInfo } from './analyzerNodeInfo';
import { convertTextRangeToRange } from '../common/positionUtils';
import { ParseFileResults } from '../parser/parser';

export class ImportFinder extends ParseTreeWalker {
    edits: TextEdit[] = [];

    constructor(private _parseResults: ParseFileResults, private _oldUri: Uri, private _newUri: Uri) {
        super();
    }

    override visitImport(node: ImportNode): boolean {
        for (const imp of node.list) {
            const importedUri = getImportInfo(imp.module)?.resolvedUris.at(-1);
            if (importedUri?.equals(this._oldUri)) {
                const newNameParts = [...imp.module.nameParts.map((part) => part.value)];
                newNameParts.splice(-1);
                newNameParts.push(this._newUri.fileNameWithoutExtensions);
                this.edits.push({
                    range: convertTextRangeToRange(imp.module, this._parseResults.tokenizerOutput.lines),
                    newText: newNameParts.join('.'),
                });
            }
        }
        return super.visitImport(node);
    }
}
