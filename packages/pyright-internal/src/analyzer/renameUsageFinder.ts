/**
 * visitor that looks for imports of an old file path and creates {@link TextEdit}s to update them for the new file path
 */

import { TextEdit } from 'vscode-languageserver-types';
import { ModuleNameNode, NameNode, ParseNodeType } from '../parser/parseNodes';
import { ParseTreeWalker } from './parseTreeWalker';
import { getFileInfo } from './analyzerNodeInfo';
import { convertTextRangeToRange } from '../common/positionUtils';
import { ParseFileResults } from '../parser/parser';
import { Uri } from '../common/uri/uri';
import { TextRangeCollection } from '../common/textRangeCollection';
import { TextRange } from '../common/textRange';
import { TypeEvaluator } from './typeEvaluatorTypes';
import { TypeCategory } from './types';

export class RenameUsageFinder extends ParseTreeWalker {
    edits: TextEdit[] = [];
    private _oldModuleName: string;
    private _newModuleName: string;
    private _lines: TextRangeCollection<TextRange>;

    constructor(
        private _evaluator: TypeEvaluator,
        fileToCheck: ParseFileResults,
        oldFile: ParseFileResults | Uri,
        newUri: Uri,
        private _rootUri: Uri
    ) {
        super();
        this._lines = fileToCheck.tokenizerOutput.lines;
        this._oldModuleName =
            'parserOutput' in oldFile
                ? getFileInfo(oldFile.parserOutput.parseTree).moduleName
                : this._uriToModuleName(oldFile);

        // we need to guess what the new module name will be based on the file name because it
        // doesn't exist yet. this might not be the best way to do it because it doesn't account
        // for whether the import was relative or not. but for now i don't care because relative
        // imports are cringe anyway
        this._newModuleName = this._uriToModuleName(newUri);
    }

    override visitModuleName = (node: ModuleNameNode): boolean => {
        // ideally this would be covered by visitName, but it seems that for performance reasons,
        // TypeEvaluator.getType doesn't evaluate types on `NameNode`s in import statements
        const currentNameParts: string[] = [];
        node.nameParts.forEach((name) => {
            currentNameParts.push(name.value);
            this._visitName(name, currentNameParts.join('.'));
        });
        return super.visitModuleName(node);
    };

    override visitName(node: NameNode): boolean {
        // `NameNode`s that are part of a `ModuleName` are handled in visitModuleName, because
        // TypeEvaluator.getType doesn't work on them
        if (node.parent?.nodeType !== ParseNodeType.ModuleName) {
            const nodeType = this._evaluator.getType(node);
            if (nodeType?.category === TypeCategory.Module && nodeType.moduleName) {
                this._visitName(node, nodeType.moduleName);
            }
        }
        return super.visitName(node);
    }

    private _visitName = (node: NameNode, moduleName: string) => {
        if (moduleName === this._oldModuleName) {
            const oldImport = this._getImportedName(this._oldModuleName);
            const newImport = this._getImportedName(this._newModuleName);
            if (node.value === oldImport && newImport !== oldImport) {
                this.edits.push({
                    range: convertTextRangeToRange(node, this._lines),
                    newText: newImport,
                });
            }
        }
        return super.visitName(node);
    };

    /**
     * @example
     * this._getImportedName("foo.bar.baz") === "baz"
     */
    private _getImportedName = (module: string) => module.slice(module.lastIndexOf('.') + 1);

    /** probably cringe. surely there's already a function somewhere that does this */
    // getModuleNameForImport or getModuleName???
    private _uriToModuleName = (uri: Uri) =>
        this._rootUri
            .getRelativePathComponents(uri)
            .join('.')
            .replace(/(\.__init__)?\.pyi?$/, '');
}
