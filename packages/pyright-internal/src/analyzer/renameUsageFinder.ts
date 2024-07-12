/**
 * visitor that looks for imports of an old file path and creates {@link TextEdit}s to update them for the new file path
 */

import { TextEdit } from 'vscode-languageserver-types';
import { ImportFromAsNode, ImportFromNode, ModuleNameNode } from '../parser/parseNodes';
import { ParseTreeWalker } from './parseTreeWalker';
import { getFileInfo, getImportInfo } from './analyzerNodeInfo';
import { convertTextRangeToRange } from '../common/positionUtils';
import { ParseFileResults } from '../parser/parser';
import { Uri } from '../common/uri/uri';
import { TextRangeCollection } from '../common/textRangeCollection';
import { TextRange } from '../common/textRange';

export class RenameUsageFinder extends ParseTreeWalker {
    edits: TextEdit[] = [];
    private _oldModuleName: string;
    private _newModuleName: string;
    private _lines: TextRangeCollection<TextRange>;

    constructor(fileToCheck: ParseFileResults, oldFile: ParseFileResults | Uri, newUri: Uri, private _rootUri: Uri) {
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

    override visitImportFromAs(node: ImportFromAsNode): boolean {
        const importedFromModule = getImportInfo((node.parent as ImportFromNode).module)?.importName;
        //TODO: this is pretty gross and also doesn't change renames where there's no longer a . in the name
        // eg. `foo.bar` > `foo`
        if (this._oldModuleName.includes('.')) {
            // split a module name (eg. `foo.bar.baz`) into the "from" and "import" parts (eg. `from foo.bar import baz`)
            const oldImportFrom = this._getImportFrom(this._oldModuleName);
            const oldImport = this._getImportedName(this._oldModuleName);
            if (importedFromModule === oldImportFrom) {
                const newImport = this._newModuleName.slice(this._newModuleName.lastIndexOf('.') + 1);
                if (node.name.value === oldImport && newImport !== oldImport) {
                    this.edits.push({
                        range: convertTextRangeToRange(node.name, this._lines),
                        newText: newImport,
                    });
                }
            }
        }
        return super.visitImportFromAs(node);
    }

    override visitModuleName = (node: ModuleNameNode): boolean => {
        const moduleName = getImportInfo(node)?.importName;
        let newText;
        if (moduleName === this._oldModuleName) {
            newText = this._newModuleName;
        } else if (moduleName?.startsWith(`${this._oldModuleName}.`)) {
            newText = moduleName.replace(this._oldModuleName, this._newModuleName);
        }
        if (newText && newText !== moduleName) {
            this.edits.push({
                range: convertTextRangeToRange(node, this._lines),
                newText,
            });
        }
        return super.visitModuleName(node);
    };

    /**
     * @example
     * this._getImportFrom("foo.bar.baz") === "foo.bar"
     */
    private _getImportFrom = (module: string) => module.slice(0, module.lastIndexOf('.'));

    /**
     * @example
     * this._getImportedName("foo.bar.baz") === "baz"
     */
    private _getImportedName = (module: string) => module.slice(module.lastIndexOf('.') + 1);

    /** probably cringe. surely there's already a function somewhere that does this */
    private _uriToModuleName = (uri: Uri) =>
        this._rootUri
            .getRelativePathComponents(uri)
            .join('.')
            .replace(/(\.__init__)?\.pyi?$/, '');
}
