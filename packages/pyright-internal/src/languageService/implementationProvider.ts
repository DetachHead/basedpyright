/*
 * implementationProvider.ts
 * Author: Doug Hoskisson
 *
 * Logic that finds all of the overrides of a symbol specified
 * by a location within a file.
 * somewhat copied from referencesProvider.ts
 */

import { CancellationToken, Location, ResultProgressReporter } from 'vscode-languageserver';

import { DeclarationType } from '../analyzer/declaration';
import { getNameNodeForDeclaration } from '../analyzer/declarationUtils';
import * as ParseTreeUtils from '../analyzer/parseTreeUtils';
import { isUserCode } from '../analyzer/sourceFileInfoUtils';
import { AssignTypeFlags, TypeEvaluator } from '../analyzer/typeEvaluatorTypes';
import { ClassType } from '../analyzer/types';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { appendArray } from '../common/collectionUtils';
import { DocumentRange } from '../common/docRange';
import { ProgramView } from '../common/extensibility';
import { ReadOnlyFileSystem } from '../common/fileSystem';
import { Position, Range, TextRange } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { ClassNode, ParseNode, ParseNodeType } from '../parser/parseNodes';
import { ParseFileResults } from '../parser/parser';
import { createDocRangeDefault, deduplicateLocations, prepareFinder } from './navigationUtils';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { ParseTreeWalker } from '../analyzer/parseTreeWalker';

export type ImplementationCallback = (locations: DocumentRange[]) => void;

export interface LocationWithNode {
    location: DocumentRange;
    parentRange?: Range;
    node: ParseNode;
}

export class ImplementationsResult {
    private readonly _results: LocationWithNode[] = [];

    // ReferencesResult had some stuff about filtering out import declarations.
    // I don't think we need that stuff here, but if we find that we do,
    // find a good way to share that behavior without duplicating code.

    constructor(private readonly _reporter?: ImplementationCallback) {
        // empty
    }

    get locations(): readonly DocumentRange[] {
        return this._results.map((l) => l.location);
    }

    get results(): readonly LocationWithNode[] {
        return this._results;
    }

    addResults(...locs: LocationWithNode[]) {
        if (locs.length === 0) {
            return;
        }

        if (this._reporter) {
            this._reporter(locs.map((l) => l.location));
        }

        appendArray(this._results, locs);
    }
}

export class ClassTreeWalker extends ParseTreeWalker {
    constructor(
        private readonly _uri: Uri,
        private readonly _parseRes: ParseFileResults,
        private readonly _callback: (node: ClassNode, uri: Uri, parseRes: ParseFileResults) => void
    ) {
        super();
    }

    override visitClass(node: ClassNode): boolean {
        this._callback(node, this._uri, this._parseRes);
        return true;
    }
}

export class ImplementationProvider {
    private _resultQueue: LocationWithNode[] = [];
    private _implementationsResult?: ImplementationsResult;

    constructor(
        private _ls: LanguageServerInterface,
        private _program: ProgramView,
        private _token: CancellationToken,
        private readonly _createDocumentRange: (
            fileUri: Uri,
            range: TextRange,
            parseResults: ParseFileResults
        ) => DocumentRange = ImplementationProvider.createDocumentRange,
        private readonly _convertToLocation?: (
            ls: LanguageServerInterface,
            fs: ReadOnlyFileSystem,
            ranges: DocumentRange
        ) => Location | undefined
    ) {}

    reportImplementations(fileUri: Uri, position: Position, resultReporter?: ResultProgressReporter<Location[]>) {
        if (!this._program.evaluator) {
            return;
        }

        const finder = prepareFinder(
            this._program,
            fileUri,
            position,
            this._ls,
            false,
            this._token,
            resultReporter,
            this._convertToLocation
        );
        if (!finder) {
            return;
        }
        const [, locations, reporter, invokedFromUserFile, declarationResult] = finder;

        this._implementationsResult = new ImplementationsResult(reporter);

        // I'm not sure of all the situations where
        // there might be more than 1 nonImportDeclarations.
        // But I think it'll work ok even if there's more than 1,
        // because assignability to all of their classes should be the same.
        const declaration = declarationResult.nonImportDeclarations.at(0);
        if (!declaration) {
            return;
        }

        if (declaration.type === DeclarationType.Class) {
            // for a class, we report all subclasses
            this._forEachSubClass(
                declaration.node,
                (foundNode, foundClass, uri, parseRes) => {
                    this._addResult(foundNode, foundNode.d.name.d.token, uri, parseRes);
                },
                this._program.evaluator,
                invokedFromUserFile
            );
        } else if (
            (declaration.type === DeclarationType.Function && declaration.isMethod) || // true for static and class methods
            declaration.type === DeclarationType.Variable
        ) {
            // for methods and attributes, we report all overrides in subclasses
            let stopAtFunction = true;
            if (declaration.type === DeclarationType.Variable && declaration.isDefinedByMemberAccess) {
                // something like `self.x = 5` inside `__init__`,
                // so we don't want to stop at that function
                stopAtFunction = false;
            }
            const enclosingClass = ParseTreeUtils.getEnclosingClass(declaration.node, stopAtFunction);
            if (enclosingClass) {
                let lookingForName: string | undefined = undefined;
                if (declaration.type === DeclarationType.Function) {
                    lookingForName = declaration.node.d.name.d.value;
                } else if (declaration.node.nodeType === ParseNodeType.Name) {
                    lookingForName = declaration.node.d.value;
                }
                // I'm not sure what Python code would lead to `declaration.node` being a `StringListNode`
                // __all__ declaration shouldn't have an enclosing class
                if (lookingForName) {
                    this._forEachSubClass(
                        enclosingClass,
                        (foundNode, foundClass, uri, parseRes) => {
                            const overrideDeclarations = foundClass.shared.fields
                                .get(lookingForName)
                                ?.getDeclarations();
                            if (overrideDeclarations) {
                                for (const decl of overrideDeclarations) {
                                    const declName = getNameNodeForDeclaration(decl) || decl.node;
                                    this._addResult(decl.node, declName, uri, parseRes);
                                }
                            }
                        },
                        this._program.evaluator,
                        invokedFromUserFile
                    );
                }
            }
        }

        return deduplicateLocations(locations);
    }

    static createDocumentRange(fileUri: Uri, range: TextRange, parseResults: ParseFileResults): DocumentRange {
        return createDocRangeDefault(fileUri, range, parseResults);
    }

    /**
     * The term "subclass" has some nuance here. It's not just nominal subclasses,
     * because we want to support finding implementations of Protocols too.
     * So "subclass" means a class that's assignable to the base class.
     */
    private _forEachSubClass(
        node: ClassNode,
        subClassCallback: (foundNode: ClassNode, foundClass: ClassType, uri: Uri, parseRes: ParseFileResults) => void,
        evaluator: TypeEvaluator,
        invokedFromUserFile: boolean
    ): void {
        const baseClassType = evaluator.getTypeOfClass(node)?.classType;
        if (!baseClassType) {
            return;
        }

        const nodeCallback = (foundNode: ClassNode, uri: Uri, parseRes: ParseFileResults) => {
            const foundClass = evaluator.getTypeOfClass(foundNode)?.classType;
            if (
                foundClass &&
                evaluator.assignType(
                    baseClassType,
                    foundClass,
                    undefined,
                    undefined,
                    AssignTypeFlags.DisallowSrcDerivedFromAny
                )
            ) {
                subClassCallback(foundNode, foundClass, uri, parseRes);
            }
        };

        for (const eachSourceFileInfo of this._program.getSourceFileInfoList()) {
            throwIfCancellationRequested(this._token);

            // "Find all implementations" will only include implementations from user code
            // unless the file is explicitly opened in the editor or it is invoked from non user files.
            if (eachSourceFileInfo.isOpenByClient || !invokedFromUserFile || isUserCode(eachSourceFileInfo)) {
                // See if "class" is somewhere within the file.
                // If not, we can skip additional processing for the file.
                const fileContents = eachSourceFileInfo.contents;
                if (fileContents.indexOf('class') >= 0) {
                    const parseResults = this._program.getParseResults(eachSourceFileInfo.uri);
                    if (!parseResults) {
                        continue;
                    }
                    const moduleNode = parseResults.parserOutput.parseTree;
                    if (moduleNode) {
                        const classTreeWalker = new ClassTreeWalker(eachSourceFileInfo.uri, parseResults, nodeCallback);
                        classTreeWalker.walk(moduleNode);
                        this._processResultQueue(); // after each file, send results
                    }
                }

                // copied from referencesProvider (assuming it applies here too):
                // This operation can consume significant memory, so check
                // for situations where we need to discard the type cache.
                this._program.handleMemoryHighUsage();
            }
        }
        if (this._resultQueue.length !== 0) {
            throw new Error('expected result result queue to be empty after finishing iteration through subtypes');
        }
    }

    private _processResultQueue() {
        if (this._resultQueue.length === 0) {
            return;
        }

        this._implementationsResult?.addResults(...this._resultQueue);
        this._resultQueue.length = 0;
    }

    private _addResult(node: ParseNode, range: TextRange, uri: Uri, parseResults: ParseFileResults) {
        this._resultQueue.push({
            node: node,
            location: this._createDocumentRange(uri, range, parseResults),
            parentRange: node.parent ? createDocRangeDefault(uri, node.parent, parseResults).range : undefined,
        });
    }
}
