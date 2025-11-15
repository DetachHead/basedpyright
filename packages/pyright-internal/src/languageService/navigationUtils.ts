/*
 * navigationUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Helper functions for navigating files.
 */
import { Location } from 'vscode-languageserver-types';
import { DocumentRange } from '../common/docRange';
import { ReadOnlyFileSystem } from '../common/fileSystem';
import { Uri } from '../common/uri/uri';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { ProgramView, ReferenceUseCase, SourceFileInfo } from '../common/extensibility';
import { CancellationToken, ResultProgressReporter } from 'vscode-languageserver';
import { appendArray } from '../common/collectionUtils';
import { isUserCode } from '../analyzer/sourceFileInfoUtils';
import { ReferencesProvider, ReferencesResult } from './referencesProvider';
import { Position } from '../common/textRange';

export type ResultCallback = (locations: DocumentRange[]) => void;

export function canNavigateToFile(fs: ReadOnlyFileSystem, path: Uri): boolean {
    return !fs.isInZip(path);
}

export function convertDocumentRangesToLocation(
    ls: LanguageServerInterface,
    fs: ReadOnlyFileSystem,
    ranges: DocumentRange[],
    converter: (
        ls: LanguageServerInterface,
        fs: ReadOnlyFileSystem,
        range: DocumentRange
    ) => Location | undefined = convertDocumentRangeToLocation
): Location[] {
    return ranges.map((range) => converter(ls, fs, range)).filter((loc) => !!loc) as Location[];
}

export function convertDocumentRangeToLocation(
    ls: LanguageServerInterface,
    fs: ReadOnlyFileSystem,
    range: DocumentRange
): Location | undefined {
    if (!canNavigateToFile(fs, range.uri)) {
        return undefined;
    }

    return Location.create(ls.convertUriToLspUriString(fs, range.uri), range.range);
}

export function prepareFinder(
    program: ProgramView,
    fileUri: Uri,
    position: Position,
    ls: LanguageServerInterface,
    useReportForInitialDeclSearch: boolean,
    token: CancellationToken,
    resultReporter?: ResultProgressReporter<Location[]>,
    convertToLocation?: (
        ls: LanguageServerInterface,
        fs: ReadOnlyFileSystem,
        ranges: DocumentRange
    ) => Location | undefined
): [SourceFileInfo, Location[], ResultCallback, boolean, ReferencesResult] | undefined {
    const sourceFileInfo = program.getSourceFileInfo(fileUri);
    if (!sourceFileInfo) {
        return;
    }

    const parseResults = program.getParseResults(fileUri);
    if (!parseResults) {
        return;
    }

    const locations: Location[] = [];
    const reporter: ResultCallback = resultReporter
        ? (range) =>
              resultReporter.report(convertDocumentRangesToLocation(ls, program.fileSystem, range, convertToLocation))
        : (range) =>
              appendArray(locations, convertDocumentRangesToLocation(ls, program.fileSystem, range, convertToLocation));

    const invokedFromUserFile = isUserCode(sourceFileInfo);
    const declarationResult = ReferencesProvider.getDeclarationForPosition(
        program,
        fileUri,
        position,
        useReportForInitialDeclSearch ? reporter : undefined,
        ReferenceUseCase.References,
        token
    );
    if (!declarationResult) {
        return;
    }

    return [sourceFileInfo, locations, reporter, invokedFromUserFile, declarationResult];
}
