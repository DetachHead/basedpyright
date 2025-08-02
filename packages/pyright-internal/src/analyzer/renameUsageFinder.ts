import { TextEdit } from 'vscode-languageserver-types';
import { ModuleNameNode, NameNode, ParseNodeType } from '../parser/parseNodes';
import { ParseTreeWalker } from './parseTreeWalker';
import { getFileInfo, getImportInfo } from './analyzerNodeInfo';
import { convertTextRangeToRange } from '../common/positionUtils';
import { ParseFileResults } from '../parser/parser';
import { Uri } from '../common/uri/uri';
import { TextRangeCollection } from '../common/textRangeCollection';
import { TextRange } from '../common/textRange';
import { ModuleType, TypeCategory } from './types';
import { Program } from './program';

/**
 * visitor that looks for imports of an old file path and creates {@link TextEdit}s to update them for the new file path
 */
export class RenameUsageFinder extends ParseTreeWalker {
    edits: TextEdit[] = [];
    private _oldModuleName: string;
    private _newModuleName: string;
    private _lines: TextRangeCollection<TextRange>;
    private _oldImport: string;
    private _newImport: string;

    constructor(
        private _program: Program,
        fileToCheck: ParseFileResults,
        oldFile: ParseFileResults | Uri,
        newUri: Uri
    ) {
        super();
        this._lines = fileToCheck.tokenizerOutput.lines;
        this._oldModuleName =
            'parserOutput' in oldFile
                ? getFileInfo(oldFile.parserOutput.parseTree).moduleName
                : this._uriToModuleName(oldFile);

        this._newModuleName = this._uriToModuleName(newUri);
        this._oldImport = this._getImportedName(this._oldModuleName);
        this._newImport = this._getImportedName(this._newModuleName);
    }

    // ideally this would be covered by visitName, but it seems that for performance reasons,
    // TypeEvaluator.getType doesn't evaluate types on `NameNode`s in import statements
    override visitModuleName = (node: ModuleNameNode): boolean => {
        const importInfo = getImportInfo(node);
        // if it's a relative import we need to evaluate the parts of the name that would otherwise appear before the
        //leading dots
        const currentNameParts = importInfo?.isRelative
            ? this._uriToModuleName(importInfo.resolvedUris[0]).split('.').slice(0, -node.d.nameParts.length)
            : [];
        node.d.nameParts.forEach((name) => {
            currentNameParts.push(name.d.value);
            this._visitName(name, currentNameParts.join('.'));
        });
        return super.visitModuleName(node);
    };

    override visitName(node: NameNode): boolean {
        // `NameNode`s that are part of a `ModuleName` are handled in visitModuleName, because
        // TypeEvaluator.getType doesn't work on them
        if (node.parent?.nodeType !== ParseNodeType.ModuleName) {
            const nodeType = this._program.evaluator?.getType(
                // when a name is part of an import alias, its type is not available so we need to get it from the
                // alias name instead
                node.parent?.nodeType === ParseNodeType.ImportFromAs && node.parent.d.alias ? node.parent.d.alias : node
            );
            if (nodeType?.category === TypeCategory.Module) {
                this._visitName(node, this._uriToModuleName(this._moduleTypeToUri(nodeType)));
            }
        }
        return super.visitName(node);
    }

    private _visitName = (node: NameNode, moduleName: string) => {
        if (moduleName === this._oldModuleName) {
            if (node.d.value === this._oldImport && this._newImport !== this._oldImport) {
                this.edits.push({
                    range: convertTextRangeToRange(node, this._lines),
                    newText: this._newImport,
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

    private _uriToModuleName = (uri: Uri) =>
        this._program.importResolver.getModuleNameForImport(uri, this._program.configOptions.findExecEnvironment(uri))
            .moduleName;

    private _moduleTypeToUri = (module: ModuleType): Uri => {
        const result = module.priv.fileUri;
        if (result.isEmpty()) {
            // if the name is a package with no __init__.py it gets a synthesized type instead because there's
            // no associated file, so we need to recurse into its children until we find an actual module. this
            // won't work when the package directory is completely empty (ie. has no modules in it at all) but
            // pyright doesn't seem to support such packages anyway.
            const iteratorResult = module.priv.loaderFields.values().next();
            if (!iteratorResult.done) {
                const synthesizedType = iteratorResult.value.getSynthesizedType()?.type;
                if (synthesizedType?.category === TypeCategory.Module) {
                    return this._moduleTypeToUri(synthesizedType).getDirectory();
                } else {
                    return module.priv.fileUri;
                }
            }
        }
        return result;
    };
}
