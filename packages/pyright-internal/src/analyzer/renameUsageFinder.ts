import { TextEdit } from 'vscode-languageserver-types';
import { ImportFromAsNode, ImportFromNode, ModuleNameNode, NameNode, ParseNodeType } from '../parser/parseNodes';
import { ParseTreeWalker } from './parseTreeWalker';
import { getFileInfo } from './analyzerNodeInfo';
import { convertTextRangeToRange } from '../common/positionUtils';
import { ParseFileResults } from '../parser/parser';
import { Uri } from '../common/uri/uri';
import { TextRange } from '../common/textRange';
import { ModuleType, TypeCategory } from './types';
import { Program } from './program';
import { getDottedName, getDottedNameWithGivenNodeAsLastName } from './parseTreeUtils';
import { DeclarationType } from './declaration';

const _splitModuleName = (moduleName: string) => (moduleName === '' ? [] : moduleName.split('.'));

/** `"foo.bar.baz"` -> `"foo.bar"`, `"foo"` -> `""` */
const _parentOf = (moduleName: string) => moduleName.slice(0, Math.max(moduleName.lastIndexOf('.'), 0));

/** `"foo.bar.baz"` -> `"baz"` */
const _lastPartOf = (moduleName: string) => moduleName.slice(moduleName.lastIndexOf('.') + 1);

/**
 * the part of `moduleName` after `prefix`, or `undefined` if `moduleName` is not equal to or a submodule of `prefix`
 * @example
 * _tailAfter("foo.bar.baz", "foo") === "bar.baz"
 * _tailAfter("foo.bar.baz", "foo.bar.baz") === ""
 * _tailAfter("foo.bar.baz", "") === "foo.bar.baz"
 * _tailAfter("foo.bar.baz", "qux") === undefined
 */
const _tailAfter = (moduleName: string, prefix: string): string | undefined => {
    if (prefix === '') {
        return moduleName;
    }
    if (moduleName === prefix) {
        return '';
    }
    if (moduleName.startsWith(`${prefix}.`)) {
        const tail = moduleName.slice(prefix.length + 1);
        return tail;
    }
    return undefined;
};

function _commonPrefixLength<A, B>(predicate: (a: A, b: B) => boolean, a: A[], b: B[]): number {
    let index = 0;
    while (index < a.length && index < b.length && predicate(a[index], b[index])) {
        index++;
    }
    return index;
}

/**
 * returns `target` as a relative import from a module inside `fromPackage`, or `undefined` if they share
 * no common ancestor (in which case only an absolute import can reach it)
 * @example
 * _relativeModuleName("foo.baz", "foo.bar") === "..baz"
 * _relativeModuleName("foo", "foo.bar") === ".."
 * _relativeModuleName("foo.bar.baz", "foo.bar") === ".baz"
 */
const _relativeModuleName = (target: string, fromPackage: string): string | undefined => {
    const targetParts = _splitModuleName(target);
    const fromPackageParts = _splitModuleName(fromPackage);

    const common = _commonPrefixLength(
        (targetPart, fromPackagePart) => targetPart === fromPackagePart,
        targetParts,
        fromPackageParts
    );
    if (common === 0) {
        return undefined;
    }

    const stepsBack = '.'.repeat(fromPackageParts.length - common + 1);
    const stepsForward = targetParts.slice(common).join('.');
    return stepsBack + stepsForward;
};

/**
 * visitor that looks for imports of an old file path (the one being renamed) and creates {@link
 * TextEdit}s to update them for the new file path.  the old path can be a module or a package, and the
 * new path can be anywhere - the directory part of the path is handled as well as the file name.
 */
export class RenameUsageFinder extends ParseTreeWalker {
    edits: TextEdit[] = [];
    private _oldModuleName: string;
    private _newModuleName: string;

    /** the package that relative imports in the file being checked resolve against */
    private _packageOfFileToCheck: string;

    constructor(
        private _program: Program,
        private _fileToCheck: ParseFileResults,
        oldFile: ParseFileResults | Uri,
        newUri: Uri
    ) {
        super();
        this._oldModuleName =
            'parserOutput' in oldFile
                ? getFileInfo(oldFile.parserOutput.parseTree, _program.analyzerNodeInfoContext).moduleName
                : this._uriToModuleName(oldFile);

        this._newModuleName = this._uriToModuleName(newUri);

        const fileInfo = getFileInfo(_fileToCheck.parserOutput.parseTree, _program.analyzerNodeInfoContext);
        this._packageOfFileToCheck = fileInfo.fileUri.stripExtension().pathEndsWith('__init__')
            ? fileInfo.moduleName
            : _parentOf(fileInfo.moduleName);
    }

    // ideally this would be covered by visitName, but it seems that for performance reasons,
    // TypeEvaluator.getType doesn't evaluate types on `NameNode`s in import statements
    override visitModuleName = (node: ModuleNameNode): boolean => {
        // for relative imports, the parts of the name that the leading dots represent
        const currentNameParts = [...this._implicitPartsOf(node)];
        for (const [i, name] of node.d.nameParts.entries()) {
            currentNameParts.push(name.d.value);

            const newModuleName = this._renamedModuleName(currentNameParts.join('.'));
            if (newModuleName !== undefined) {
                this._rewriteModuleName(node, i, newModuleName);
                break;
            }
        }
        return super.visitModuleName(node);
    };

    override visitImportFrom = (node: ImportFromNode): boolean => {
        if (node.d.isWildcardImport) {
            return super.visitImportFrom(node);
        }
        const fromModuleName = this._absoluteModuleNameOf(node.d.module);
        const newFromModuleName = this._renamedModuleName(fromModuleName) ?? fromModuleName;
        let rewroteStatement = false;
        for (const importedName of node.d.imports) {
            const newModuleName = this._renamedModuleNameOfExpression(importedName.d.alias ?? importedName.d.name);
            if (newModuleName === undefined) {
                continue;
            }
            if (_parentOf(newModuleName) === newFromModuleName) {
                // the module is still in the same package as the rest of the `from` statement, so only its name
                // can have changed
                this._addEdit(importedName.d.name, _lastPartOf(newModuleName));
            } else if (node.d.imports.length === 1) {
                this._rewriteImportFrom(node, newModuleName);
                rewroteStatement = true;
            } else {
                this._splitOutOfImportFrom(node, importedName, newModuleName);
            }
        }
        // a rewritten statement has already been dealt with in full, so its module name and imported names
        // must not be visited again
        return !rewroteStatement;
    };

    override visitName(node: NameNode): boolean {
        // `NameNode`s that are part of an import statement are handled in visitModuleName and visitImportFrom
        if (
            node.parent?.nodeType === ParseNodeType.ModuleName ||
            node.parent?.nodeType === ParseNodeType.ImportFromAs ||
            node.parent?.nodeType === ParseNodeType.ImportAs
        ) {
            return super.visitName(node);
        }

        const moduleName = this._moduleNameOfExpression(node);
        if (moduleName === undefined) {
            // the name isn't a module
            return super.visitName(node);
        }
        const newModuleName = this._renamedModuleName(moduleName);
        if (newModuleName === undefined) {
            // the module isn't the one being renamed, or inside it
            return super.visitName(node);
        }

        // e.g., for the `baz` in `foo.bar.baz.qux`, `names` is `[foo, bar, baz]`
        const names = getDottedName(getDottedNameWithGivenNodeAsLastName(node)) ?? [node];

        // find the closest name to the left that still refers to a package containing the module after the
        // rename, and rewrite everything after it. e.g., if `foo.bar.baz` moved to `foo.baz`, `foo` is
        // that anchor and `bar.baz` becomes `baz`
        for (let i = names.length - 2; i >= 0; i--) {
            const anchorModuleName = this._moduleNameOfExpression(names[i]);
            if (anchorModuleName === undefined) {
                break;
            }
            const tail = _tailAfter(newModuleName, this._renamedModuleName(anchorModuleName) ?? anchorModuleName);
            if (tail) {
                this._addEdit(TextRange.fromBounds(names[i + 1].start, TextRange.getEnd(node)), tail);
                return super.visitName(node);
            }
        }

        if (this._isBoundByPlainImport(names[0])) {
            // the whole dotted name spells out the module path, so the whole thing gets replaced
            this._addEdit(TextRange.fromBounds(names[0].start, TextRange.getEnd(node)), newModuleName);
        } else if (node.d.value === _lastPartOf(moduleName)) {
            // the name was bound by a `from` import (or an alias, in which case its value won't match and we
            // leave it alone), so only the module's own name matters
            this._addEdit(node, _lastPartOf(newModuleName));
        }
        return super.visitName(node);
    }

    /**
     * the new name of `moduleName` if it is the module being renamed or a submodule of it, otherwise `undefined`
     */
    private _renamedModuleName = (moduleName: string): string | undefined => {
        const tail = _tailAfter(moduleName, this._oldModuleName);
        if (tail === undefined) {
            return undefined;
        }
        return tail === '' ? this._newModuleName : `${this._newModuleName}.${tail}`;
    };

    /** the new name of the module that `node` refers to, or `undefined` if it isn't a module or isn't affected */
    private _renamedModuleNameOfExpression = (node: NameNode): string | undefined => {
        const moduleName = this._moduleNameOfExpression(node);
        return moduleName === undefined ? undefined : this._renamedModuleName(moduleName);
    };

    private _implicitPartsOf = (node: ModuleNameNode): string[] => {
        if (node.d.leadingDots === 0) {
            return [];
        }
        const packageParts = _splitModuleName(this._packageOfFileToCheck);
        return packageParts.slice(0, Math.max(packageParts.length - (node.d.leadingDots - 1), 0));
    };

    /** the full dotted name of the module an import statement refers to, with any leading dots resolved */
    private _absoluteModuleNameOf = (node: ModuleNameNode) =>
        [...this._implicitPartsOf(node), ...node.d.nameParts.map((name) => name.d.value)].join('.');

    /** the package that relative imports in the file being checked will resolve against after the rename */
    private _newPackageOfFileToCheck = () =>
        this._renamedModuleName(this._packageOfFileToCheck) ?? this._packageOfFileToCheck;

    /**
     * replaces the name parts up to and including `lastIndex` with `newModuleName`, keeping the import
     * relative if it was already
     */
    private _rewriteModuleName = (node: ModuleNameNode, lastIndex: number, newModuleName: string) => {
        const existingNameParts = node.d.nameParts.slice(0, lastIndex + 1);
        if (node.d.leadingDots === 0) {
            this._replaceNameParts(existingNameParts, newModuleName);
            return;
        }

        // existing module path is relative
        const implicitModuleName = this._implicitPartsOf(node).join('.');
        const newImplicitModuleName = this._renamedModuleName(implicitModuleName) ?? implicitModuleName;
        const tail = _tailAfter(newModuleName, newImplicitModuleName);
        if (tail) {
            this._replaceNameParts(existingNameParts, tail);
            return;
        }

        // the module is no longer reachable from where the leading dots point, so we have to re-anchor
        // the whole thing
        this._addEdit(
            TextRange.fromBounds(node.start, TextRange.getEnd(node.d.nameParts[lastIndex])),
            _relativeModuleName(newModuleName, this._newPackageOfFileToCheck()) ?? newModuleName
        );
    };

    /**
     * replaces the dotted name of `nameParts` with `newDottedName`, leaving any leading parts that don't
     * change out of the edit so that renaming `foo.bar` to `foo.baz` only touches `bar`
     */
    private _replaceNameParts = (nameParts: NameNode[], newDottedName: string) => {
        const newParts = _splitModuleName(newDottedName);
        const firstChanged = _commonPrefixLength(
            (namePart, newPart) => namePart.d.value === newPart,
            nameParts.slice(0, nameParts.length - 1),
            newParts.slice(0, newParts.length - 1)
        );
        this._addEdit(
            TextRange.fromBounds(nameParts[firstChanged].start, TextRange.getEnd(nameParts[nameParts.length - 1])),
            newParts.slice(firstChanged).join('.')
        );
    };

    /** rewrites a `from x import y` statement whose only imported name is the module being moved */
    private _rewriteImportFrom = (node: ImportFromNode, newModuleName: string) => {
        const importedName = node.d.imports[0];

        if (_parentOf(newModuleName) === '') {
            // a top level module can't be imported with a `from` statement
            this._addEdit(node, this._importStatement(newModuleName, importedName.d.alias));
            return;
        }

        const parent = this._fmtModuleName(_parentOf(newModuleName), node.d.module.d.leadingDots > 0);
        const child = _lastPartOf(newModuleName);
        this._addEdit(node.d.module, parent);
        this._addEdit(importedName.d.name, child);
    };

    /**
     * removes the module being moved from a `from x import y, z` statement and imports it from its new
     * location in a new statement on the next line
     */
    private _splitOutOfImportFrom = (node: ImportFromNode, importedName: ImportFromAsNode, newModuleName: string) => {
        const index = node.d.imports.indexOf(importedName);
        const removedRange =
            index === 0
                ? TextRange.fromBounds(importedName.start, node.d.imports[1].start)
                : TextRange.fromBounds(TextRange.getEnd(node.d.imports[index - 1]), TextRange.getEnd(importedName));
        this._addEdit(removedRange, '');

        const lines = this._fileToCheck.tokenizerOutput.lines;
        const line = lines.getItemAt(lines.getItemAtPosition(node.start));
        const indent = this._fileToCheck.text.slice(line.start, node.start);
        this._addEdit(
            TextRange.fromBounds(TextRange.getEnd(node), TextRange.getEnd(node)),
            this._fileToCheck.tokenizerOutput.predominantEndOfLineSequence +
                (/^\s*$/.test(indent) ? indent : '') +
                this._importStatement(newModuleName, importedName.d.alias, node.d.module.d.leadingDots > 0)
        );
    };

    private _importStatement = (moduleName: string, alias: NameNode | undefined, relative = false) => {
        const aliasText = alias ? ` as ${alias.d.value}` : '';
        if (_parentOf(moduleName) === '') {
            return `import ${moduleName}${aliasText}`;
        }
        const parent = this._fmtModuleName(_parentOf(moduleName), relative);
        const child = _lastPartOf(moduleName);
        return `from ${parent} import ${child}${aliasText}`;
    };

    private _fmtModuleName = (moduleName: string, relative: boolean) => {
        if (!relative) {
            return moduleName;
        }
        return _relativeModuleName(moduleName, this._newPackageOfFileToCheck()) ?? moduleName;
    };

    /** whether the name was bound by an `import foo.bar` statement, in which case it already spells out
     * the module path */
    private _isBoundByPlainImport = (node: NameNode) =>
        this._program.evaluator
            ?.getDeclInfoForNameNode(node)
            ?.decls.some(
                (decl) =>
                    decl.type === DeclarationType.Alias &&
                    decl.node.nodeType === ParseNodeType.ImportAs &&
                    decl.node.d.alias === undefined
            ) ?? false;

    private _moduleNameOfExpression = (node: NameNode): string | undefined => {
        const type = this._program.evaluator?.getType(node);
        if (type?.category === TypeCategory.Module) {
            return this._uriToModuleName(this._moduleTypeToUri(type));
        }
        return undefined;
    };

    private _addEdit = (range: TextRange, newText: string) => {
        if (this._fileToCheck.text.slice(range.start, TextRange.getEnd(range)) === newText) {
            // callers rely on this - when a submodule moves along with its package, they produce edits
            // whose text is exactly what's already there
            return;
        }
        this.edits.push({
            range: convertTextRangeToRange(range, this._fileToCheck.tokenizerOutput.lines),
            newText,
        });
    };

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
