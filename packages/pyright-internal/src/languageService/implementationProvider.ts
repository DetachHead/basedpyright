/*
 * implementationsProvider.ts
 * Author: Doug Hoskisson
 *
 * Logic that finds all of the overrides of a symbol specified
 * by a location within a file.
 * somewhat copied from referencesProvider.ts
 */

import { CancellationToken, Location, ResultProgressReporter } from 'vscode-languageserver';

import { ClassDeclaration, Declaration, DeclarationType, isAliasDeclaration } from '../analyzer/declaration';
import { getNameFromDeclaration } from '../analyzer/declarationUtils';
import * as ParseTreeUtils from '../analyzer/parseTreeUtils';
import { isUserCode } from '../analyzer/sourceFileInfoUtils';
import { Symbol } from '../analyzer/symbol';
import { isVisibleExternally } from '../analyzer/symbolUtils';
import { TypeEvaluator } from '../analyzer/typeEvaluatorTypes';
import { ClassType, maxTypeRecursionCount, TypeCategory } from '../analyzer/types';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { appendArray } from '../common/collectionUtils';
import { isDefined } from '../common/core';
import { assertNever } from '../common/debug';
import { DocumentRange } from '../common/docRange';
import { ProgramView, ReferenceUseCase, SymbolUsageProvider } from '../common/extensibility';
import { ReadOnlyFileSystem } from '../common/fileSystem';
import { convertOffsetToPosition, convertPositionToOffset } from '../common/positionUtils';
import { ServiceKeys } from '../common/serviceKeys';
import { isRangeInRange, Position, Range, TextRange } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { ClassNode, NameNode, ParseNode, ParseNodeType } from '../parser/parseNodes';
import { ParseFileResults } from '../parser/parser';
import { CollectionResult, DocumentSymbolCollector } from './documentSymbolCollector';
import { convertDocumentRangesToLocation } from './navigationUtils';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { isConstructor } from '../analyzer/constructors';
import { ReferencesProvider } from './referencesProvider';
import { ParseTreeWalkerSkipExpr } from '../analyzer/parseTreeWalkerSkipExpr';

export type ImplementationCallback = (locations: DocumentRange[]) => void;  // TODO: verify used

export interface LocationWithNode {  // TODO: verify used
    location: DocumentRange;
    parentRange?: Range;
    node: ParseNode;
}

export class ImplementationsResult {  // TODO: go through this whole class later, skipping for now
    private readonly _results: LocationWithNode[] = [];

    readonly nonImportDeclarations: Declaration[];  // TODO: verify used

    constructor(
        readonly requiresGlobalSearch: boolean,  // TODO: verify used - probably don't need
        readonly nodeAtOffset: ParseNode,
        readonly symbolNames: string[],
        readonly declarations: Declaration[],  // TODO: verify used
        // readonly useCase: ReferenceUseCase,  // TODO: delete
        readonly providers: readonly SymbolUsageProvider[],
        private readonly _reporter?: ImplementationCallback  // TODO: verify used
    ) {
        // Filter out any import decls. but leave one with alias.
        this.nonImportDeclarations = declarations.filter((d) => {
            if (!isAliasDeclaration(d)) {
                return true;
            }

            // We must have alias and decl node that point to import statement.
            if (!d.usesLocalName || !d.node) {
                return false;
            }

            // d.node can't be ImportFrom if usesLocalName is true.
            // but we are doing this for type checker.
            if (d.node.nodeType === ParseNodeType.ImportFrom) {
                return false;
            }

            // Extract alias for comparison (symbolNames.some can't know d is for an Alias).
            const alias = d.node.d.alias?.d.value;

            // Check alias and what we are renaming is same thing.
            if (!symbolNames.some((s) => s === alias)) {
                return false;
            }

            return true;
        });
    }

    get containsOnlyImportDecls(): boolean {
        return this.declarations.length > 0 && this.nonImportDeclarations.length === 0;
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

export class FindReferencesTreeWalker {  // TODO: might be able to delete this
    private _parseResults: ParseFileResults | undefined;

    constructor(
        private _program: ProgramView,
        private _fileUri: Uri,
        private _implementationsResult: ImplementationsResult,
        private _includeDeclaration: boolean,
        private _cancellationToken: CancellationToken,
        private readonly _createDocumentRange: (
            fileUri: Uri,
            result: CollectionResult,
            parseResults: ParseFileResults
        ) => DocumentRange = FindReferencesTreeWalker.createDocumentRange,
        private readonly _checkConstructorUsagesForClass: ClassDeclaration | undefined
    ) {
        this._parseResults = this._program.getParseResults(this._fileUri);
    }

    findReferences(rootNode = this._parseResults?.parserOutput.parseTree) {
        const results: LocationWithNode[] = [];
        if (!this._parseResults) {
            return results;
        }

        const collector = new DocumentSymbolCollector(
            this._program,
            this._implementationsResult.symbolNames,
            this._implementationsResult.declarations,
            rootNode!,
            this._cancellationToken,
            {
                treatModuleInImportAndFromImportSame: true,
                skipUnreachableCode: false,
                // useCase: this._referencesResult.useCase,
                providers: this._implementationsResult.providers,
            }
        );

        const collectionResults = collector.collect();

        if (this._checkConstructorUsagesForClass) {
            const classCollector = new DocumentSymbolCollector(
                this._program,
                [this._checkConstructorUsagesForClass.node.d.name.d.value],
                [this._checkConstructorUsagesForClass],
                rootNode!,
                this._cancellationToken,
                {
                    treatModuleInImportAndFromImportSame: true,
                    skipUnreachableCode: false,
                    // useCase: this._referencesResult.useCase,
                    providers: this._implementationsResult.providers,
                }
            );
            collectionResults.push(
                ...classCollector.collect().filter((result) => result.node.parent?.nodeType === ParseNodeType.Call)
            );
        }

        for (const result of collectionResults) {
            // Is it the same symbol?
            if (this._includeDeclaration || result.node !== this._implementationsResult.nodeAtOffset) {
                results.push({
                    node: result.node,
                    location: this._createDocumentRange(this._fileUri, result, this._parseResults),
                    parentRange: result.node.parent
                        ? {
                              start: convertOffsetToPosition(
                                  result.node.parent.start,
                                  this._parseResults.tokenizerOutput.lines
                              ),
                              end: convertOffsetToPosition(
                                  TextRange.getEnd(result.node.parent),
                                  this._parseResults.tokenizerOutput.lines
                              ),
                          }
                        : undefined,
                });
            }
        }

        return results;
    }

    static createDocumentRange(fileUri: Uri, result: CollectionResult, parseResults: ParseFileResults): DocumentRange {
        return {
            uri: fileUri,
            range: {
                start: convertOffsetToPosition(result.range.start, parseResults.tokenizerOutput.lines),
                end: convertOffsetToPosition(TextRange.getEnd(result.range), parseResults.tokenizerOutput.lines),
            },
        };
    }
}

export class ClassTreeWalker extends ParseTreeWalkerSkipExpr {
    constructor(private readonly _callback: (node: ClassNode) => void) {
        super();
    }

    override visitClass(node: ClassNode): boolean {
        this._callback(node);
        return true;
    }
}

export class ImplementationProvider {
    constructor(
        private _ls: LanguageServerInterface,
        private _program: ProgramView,
        private _token: CancellationToken,
        private readonly _createDocumentRange?: (
            fileUri: Uri,
            result: CollectionResult,
            parseResults: ParseFileResults
        ) => DocumentRange,
        private readonly _convertToLocation?: (
            ls: LanguageServerInterface,
            fs: ReadOnlyFileSystem,
            ranges: DocumentRange
        ) => Location | undefined
    ) {
        // empty
    }

    reportImplementations(
        fileUri: Uri,
        position: Position,
        resultReporter?: ResultProgressReporter<Location[]>
    ) {
        const sourceFileInfo = this._program.getSourceFileInfo(fileUri);
        if (!sourceFileInfo) {
            return;
        }

        const parseResults = this._program.getParseResults(fileUri);
        if (!parseResults) {
            return;
        }

        if (! this._program.evaluator) {
            return;
        }

        const locations: Location[] = [];
        const reporter: ImplementationCallback = resultReporter
            ? (range) =>
                  resultReporter.report(
                      convertDocumentRangesToLocation(
                          this._ls,
                          this._program.fileSystem,
                          range,
                          this._convertToLocation
                      )
                  )
            : (range) =>
                  appendArray(
                      locations,
                      convertDocumentRangesToLocation(
                          this._ls,
                          this._program.fileSystem,
                          range,
                          this._convertToLocation
                      )
                  );

        const invokedFromUserFile = isUserCode(sourceFileInfo);
        const declarationResult = ReferencesProvider.getDeclarationForPosition(
            this._program,
            fileUri,
            position,
            undefined,
            ReferenceUseCase.References,
            this._token
        );
        if (!declarationResult) {
            return;
        }

        // I'm not sure of all the situations where
        // there might be more than 1 nonImportDeclarations.
        // But I think it'll work ok even if there's more than 1,
        // because assignability to all of their classes should be the same.
        const declaration = declarationResult.nonImportDeclarations.at(0);
        if (!declaration) {
            return;
        }

        if (declaration.type === DeclarationType.Variable) {
            declaration.isDefinedByMemberAccess;
        }

        if (declaration.type === DeclarationType.Class) {
            this._forEachSubClass(declaration.node, (foundNode, foundClass) => {
                console.log(foundNode.d.name.d.value);  // TODO: this is one of our results
            }, this._program.evaluator, invokedFromUserFile);
        }
        else if (
            (declaration.type === DeclarationType.Function && declaration.isMethod) ||  // true for static and class methods
            declaration.type === DeclarationType.Variable
        ) {
            let stopAtFunction = true;
            if (declaration.type === DeclarationType.Variable && declaration.isDefinedByMemberAccess) {
                // something like `self.x = 5` inside `__init__`,
                // so we don't want to stop at that function
                stopAtFunction = false;
            }
            const enclosingClass = ParseTreeUtils.getEnclosingClass(declaration.node, stopAtFunction);
            if (enclosingClass) {
                const lookingForName = (declaration.type === DeclarationType.Function)
                    ? (declaration.node.d.name.d.value) : (declaration.node.nodeType === ParseNodeType.Name)
                    ? (declaration.node.d.value) : undefined;
                // I don't know what Python code would lead to `declaration.node` being a `StringListNode`
                if (lookingForName) {
                    this._forEachSubClass(enclosingClass, (foundNode, foundClass) => {
                        const overrideDeclarations = foundClass.shared.fields.get(lookingForName)?.getDeclarations();
                        if (overrideDeclarations) {
                            console.log(overrideDeclarations);  // TODO: these are some of our results
                        }
                    }, this._program.evaluator, invokedFromUserFile);
                }
            }
        }

        /*
        const node = referencesResult.nodeAtOffset;
        let checkConstructorUsagesForClass: ClassDeclaration | undefined;
        if (node?.nodeType === ParseNodeType.Name && isConstructor(node.d.value)) {
            const type = this._program.evaluator?.getType(node);
            if (type?.category === TypeCategory.Function && type.shared.methodClass) {
                const classDeclaration = type.shared.methodClass.shared.declaration;
                if (classDeclaration?.type === DeclarationType.Class) {
                    checkConstructorUsagesForClass = classDeclaration;
                }
            }
        }

        // Do we need to do a global search as well?
        if (!referencesResult.requiresGlobalSearch) {
            this.addReferencesToResult(
                sourceFileInfo.uri,
                includeDeclaration,
                referencesResult,
                checkConstructorUsagesForClass
            );
        }

        for (const curSourceFileInfo of this._program.getSourceFileInfoList()) {
            throwIfCancellationRequested(this._token);

            // "Find all references" will only include references from user code
            // unless the file is explicitly opened in the editor or it is invoked from non user files.
            if (curSourceFileInfo.isOpenByClient || !invokedFromUserFile || isUserCode(curSourceFileInfo)) {
                // See if the reference symbol's string is located somewhere within the file.
                // If not, we can skip additional processing for the file.
                const fileContents = curSourceFileInfo.contents;

                if (
                    checkConstructorUsagesForClass ||
                    !fileContents ||
                    referencesResult.symbolNames.some((s) => fileContents.indexOf(s) >= 0)
                ) {
                    this.addReferencesToResult(
                        curSourceFileInfo.uri,
                        includeDeclaration,
                        referencesResult,
                        checkConstructorUsagesForClass
                    );
                }

                // This operation can consume significant memory, so check
                // for situations where we need to discard the type cache.
                this._program.handleMemoryHighUsage();
            }
        }

        // Make sure to include declarations regardless where they are defined
        // if includeDeclaration is set.
        if (includeDeclaration) {
            for (const decl of referencesResult.declarations) {
                throwIfCancellationRequested(this._token);

                if (referencesResult.locations.some((l) => l.uri.equals(decl.uri))) {
                    // Already included.
                    continue;
                }

                const declFileInfo = this._program.getSourceFileInfo(decl.uri);
                if (!declFileInfo) {
                    // The file the declaration belongs to doesn't belong to the program.
                    continue;
                }

                const tempResult = new ReferencesResult(
                    referencesResult.requiresGlobalSearch,
                    node,
                    referencesResult.symbolNames,
                    referencesResult.declarations,
                    referencesResult.useCase,
                    referencesResult.providers
                );

                this.addReferencesToResult(declFileInfo.uri, includeDeclaration, tempResult, undefined);
                for (const result of tempResult.results) {
                    // Include declarations only. And throw away any references
                    if (result.location.uri.equals(decl.uri) && isRangeInRange(decl.range, result.location.range)) {
                        referencesResult.addResults(result);
                    }
                }
            }
        }

        // Deduplicate locations before returning them.
        const locationsSet = new Set<string>();
        const dedupedLocations: Location[] = [];
        for (const loc of locations) {
            const key = `${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`;
            if (!locationsSet.has(key)) {
                locationsSet.add(key);
                dedupedLocations.push(loc);
            }
        }

        return dedupedLocations;
        */
        return [];
    }

    /**
     * The term "subclass" has some nuance here. It's not just nominal subclasses,
     * because we want to support finding implementations of Protocols too.
     * So "subclass" means a class that's assignable to the base class.
     */
    private _forEachSubClass(node: ClassNode, subClassCallback: (foundNode: ClassNode, foundClass: ClassType) => void, evaluator: TypeEvaluator, invokedFromUserFile: boolean): void {
        const baseClassType = evaluator.getTypeOfClass(node)?.classType;
        if (!baseClassType) {
            return;
        }

        const nodeCallback = (foundNode: ClassNode) => {
            const foundClass = evaluator.getTypeOfClass(foundNode)?.classType;
            if (foundClass && evaluator.assignType(baseClassType, foundClass)) {
                subClassCallback(foundNode, foundClass);
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
                if (fileContents.indexOf("class") >= 0) {
                    const parseInfo = this._program.getParseResults(eachSourceFileInfo.uri)?.parserOutput.parseTree;
                    if (parseInfo) {
                        const classTreeWalker = new ClassTreeWalker(nodeCallback);
                        classTreeWalker.walk(parseInfo);
                    }
                }

                // copied from referencesProvider (assuming it applies here too):
                // This operation can consume significant memory, so check
                // for situations where we need to discard the type cache.
                this._program.handleMemoryHighUsage();
            }
        }
    }

    addReferencesToResult(
        fileUri: Uri,
        includeDeclaration: boolean,
        referencesResult: ImplementationsResult,
        checkConstructorUsagesForClass: ClassDeclaration | undefined
    ): void {
        const parseResults = this._program.getParseResults(fileUri);
        if (!parseResults) {
            return;
        }

        const refTreeWalker = new FindReferencesTreeWalker(
            this._program,
            fileUri,
            referencesResult,
            includeDeclaration,
            this._token,
            this._createDocumentRange,
            checkConstructorUsagesForClass
        );

        referencesResult.addResults(...refTreeWalker.findReferences());
    }

    static getDeclarationForNode(
        program: ProgramView,
        fileUri: Uri,
        node: NameNode,
        reporter: ImplementationCallback | undefined,
        useCase: ReferenceUseCase,
        token: CancellationToken
    ) {
        throwIfCancellationRequested(token);

        const declarations = DocumentSymbolCollector.getDeclarationsForNode(program, node, token, {
            resolveLocalNames: false,
        });

        if (declarations.length === 0) {
            return undefined;
        }

        const requiresGlobalSearch = isVisibleOutside(program.evaluator!, fileUri, node, declarations);
        const symbolNames = new Set<string>(declarations.map((d) => getNameFromDeclaration(d)!).filter((n) => !!n));
        symbolNames.add(node.d.value);

        const providers = (program.serviceProvider.tryGet(ServiceKeys.symbolUsageProviderFactory) ?? [])
            .map((f) => f.tryCreateProvider(useCase, declarations, token))
            .filter(isDefined);

        // Check whether we need to add new symbol names and declarations.
        providers.forEach((p) => {
            p.appendSymbolNamesTo(symbolNames);
            p.appendDeclarationsTo(declarations);
        });

        return new ImplementationsResult(
            requiresGlobalSearch,
            node,
            Array.from(symbolNames.values()),
            declarations,
            // useCase,
            providers,
            reporter
        );
    }

    static getDeclarationForPosition(
        program: ProgramView,
        fileUri: Uri,
        position: Position,
        reporter: ImplementationCallback | undefined,
        useCase: ReferenceUseCase,
        token: CancellationToken
    ): ImplementationsResult | undefined {
        throwIfCancellationRequested(token);
        const parseResults = program.getParseResults(fileUri);
        if (!parseResults) {
            return undefined;
        }

        const offset = convertPositionToOffset(position, parseResults.tokenizerOutput.lines);
        if (offset === undefined) {
            return undefined;
        }

        const node = ParseTreeUtils.findNodeByOffset(parseResults.parserOutput.parseTree, offset);
        if (node === undefined) {
            return undefined;
        }

        // If this isn't a name node, there are no references to be found.
        if (node.nodeType !== ParseNodeType.Name) {
            return undefined;
        }

        return this.getDeclarationForNode(program, fileUri, node, reporter, useCase, token);
    }
}

function isVisibleOutside(evaluator: TypeEvaluator, currentUri: Uri, node: NameNode, declarations: Declaration[]) {
    const result = evaluator.lookUpSymbolRecursive(node, node.d.value, /* honorCodeFlow */ false);
    if (result && !isExternallyVisible(result.symbol)) {
        return false;
    }

    // A symbol's effective external visibility check is not enough to determine whether
    // the symbol is visible to the outside. Something like the local variable inside
    // a function will still say it is externally visible even if it can't be accessed from another module.
    // So, we also need to determine whether the symbol is declared within an evaluation scope
    // that is within the current file and cannot be imported directly from other modules.
    return declarations.some((decl) => {
        // If the declaration is outside of this file, a global search is needed.
        if (!decl.uri.equals(currentUri)) {
            return true;
        }

        const evalScope = ParseTreeUtils.getEvaluationScopeNode(decl.node).node;

        // If the declaration is at the module level or a class level, it can be seen
        // outside of the current module, so a global search is needed.
        if (evalScope.nodeType === ParseNodeType.Module || evalScope.nodeType === ParseNodeType.Class) {
            return true;
        }

        // If the name node is a member variable, we need to do a global search.
        if (decl.node?.parent?.nodeType === ParseNodeType.MemberAccess && decl.node === decl.node.parent.d.member) {
            return true;
        }

        return false;
    });

    // Return true if the symbol is visible outside of current module, false if not.
    function isExternallyVisible(symbol: Symbol, recursionCount = 0): boolean {
        if (recursionCount > maxTypeRecursionCount) {
            return false;
        }

        recursionCount++;

        if (!isVisibleExternally(symbol)) {
            return false;
        }

        return symbol.getDeclarations().reduce<boolean>((isVisible, decl) => {
            if (!isVisible) {
                return false;
            }

            switch (decl.type) {
                case DeclarationType.Alias:
                case DeclarationType.Intrinsic:
                case DeclarationType.SpecialBuiltInClass:
                    return isVisible;

                case DeclarationType.Class:
                case DeclarationType.Function:
                    return isVisible && isContainerExternallyVisible(decl.node.d.name, recursionCount);

                case DeclarationType.Param:
                    return isVisible && isContainerExternallyVisible(decl.node.d.name!, recursionCount);

                case DeclarationType.TypeParam:
                    return false;

                case DeclarationType.Variable:
                case DeclarationType.TypeAlias: {
                    if (decl.node.nodeType === ParseNodeType.Name) {
                        return isVisible && isContainerExternallyVisible(decl.node, recursionCount);
                    }

                    // Symbol without name is not visible outside.
                    return false;
                }

                default:
                    assertNever(decl);
            }
        }, /* visible */ true);
    }

    // Return true if the scope that contains the specified node is visible
    // outside of the current module, false if not.
    function isContainerExternallyVisible(node: NameNode, recursionCount: number) {
        let scopingNodeInfo = ParseTreeUtils.getEvaluationScopeNode(node);
        let scopingNode = scopingNodeInfo.node;

        // If this is a type parameter scope, it acts as a proxy for
        // its outer (parent) scope.
        while (scopingNodeInfo.useProxyScope && scopingNodeInfo.node.parent) {
            scopingNodeInfo = ParseTreeUtils.getEvaluationScopeNode(scopingNodeInfo.node.parent);
            scopingNode = scopingNodeInfo.node;
        }

        switch (scopingNode.nodeType) {
            case ParseNodeType.Class:
            case ParseNodeType.Function: {
                const name = scopingNode.d.name;
                const result = evaluator.lookUpSymbolRecursive(name, name.d.value, /* honorCodeFlow */ false);
                return result ? isExternallyVisible(result.symbol, recursionCount) : true;
            }

            case ParseNodeType.Lambda:
            case ParseNodeType.Comprehension:
            case ParseNodeType.TypeParameterList:
                // Symbols in this scope can't be visible outside.
                return false;

            case ParseNodeType.Module:
                return true;

            default:
                assertNever(scopingNode);
        }
    }
}
