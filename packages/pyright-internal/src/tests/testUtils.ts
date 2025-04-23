/*
 * testUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Utility functions that are common to a bunch of the tests.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { ImportResolver } from '../analyzer/importResolver';
import { Program } from '../analyzer/program';
import { NameTypeWalker } from '../analyzer/testWalker';
import { TypeEvaluator } from '../analyzer/typeEvaluatorTypes';
import { ConfigOptions, ExecutionEnvironment, getStandardDiagnosticRuleSet } from '../common/configOptions';
import { ConsoleInterface, NullConsole } from '../common/console';
import { fail } from '../common/debug';
import { Diagnostic, DiagnosticCategory } from '../common/diagnostic';
import { DiagnosticSink } from '../common/diagnosticSink';
import { FullAccessHost } from '../common/fullAccessHost';
import { RealTempFile, createFromRealFileSystem } from '../common/realFileSystem';
import { createServiceProvider } from '../common/serviceProviderExtensions';
import { Uri } from '../common/uri/uri';
import { UriEx } from '../common/uri/uriUtils';
import { ParseFileResults, ParseOptions, Parser, ParserOutput } from '../parser/parser';
import { entries } from '@detachhead/ts-helpers/dist/functions/misc';
import { DiagnosticRule } from '../common/diagnosticRules';
import { SemanticTokenItem, SemanticTokensWalker } from '../analyzer/semanticTokensWalker';
import { TypeInlayHintsItemType, TypeInlayHintsWalker } from '../analyzer/typeInlayHintsWalker';
import { Range } from 'vscode-languageserver-types';
import { ServiceProvider } from '../common/serviceProvider';
import { InlayHintSettings } from '../workspaceFactory';

// This is a bit gross, but it's necessary to allow the fallback typeshed
// directory to be located when running within the jest environment. This
// assumes that the working directory has been set appropriately before
// running the tests.
(global as any).__rootDirectory = path.resolve();

export class ErrorTrackingNullConsole extends NullConsole {
    errors = new Array<string>();

    override error(message: string) {
        this.errors.push(message);
        super.error(message);
    }
}

export interface FileAnalysisResult {
    fileUri: Uri;
    cell?: number | undefined;
    parseResults?: ParseFileResults | undefined;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    infos: Diagnostic[];
    hints: Diagnostic[];
}

export function resolveSampleFilePath(fileName: string): string {
    return path.resolve(path.dirname(module.filename), `./samples/${fileName}`);
}

export function readSampleFile(fileName: string): string {
    const filePath = resolveSampleFilePath(fileName);

    try {
        return fs.readFileSync(filePath, { encoding: 'utf8' });
    } catch {
        console.error(`Could not read file "${fileName}"`);
        return '';
    }
}

export function parseText(
    textToParse: string,
    diagSink: DiagnosticSink,
    parseOptions: ParseOptions = new ParseOptions()
): ParseFileResults {
    const parser = new Parser();
    return parser.parseSourceFile(textToParse, parseOptions, diagSink);
}

export function parseSampleFile(
    fileName: string,
    diagSink: DiagnosticSink,
    execEnvironment = new ExecutionEnvironment(
        'python',
        UriEx.file('.'),
        getStandardDiagnosticRuleSet(),
        /* defaultPythonVersion */ undefined,
        /* defaultPythonPlatform */ undefined,
        /* defaultExtraPaths */ undefined
    )
): ParseFileResults {
    const text = readSampleFile(fileName);
    const parseOptions = new ParseOptions();
    if (fileName.endsWith('pyi')) {
        parseOptions.isStubFile = true;
    }
    parseOptions.pythonVersion = execEnvironment.pythonVersion;
    return parseText(text, diagSink, parseOptions);
}

type ConfigOptionsArg = ConfigOptions | ((serviceProvider: ServiceProvider) => ConfigOptions);

const createProgram = (
    configOptions: ConfigOptionsArg = new ConfigOptions(Uri.empty()),
    console?: ConsoleInterface
) => {
    const tempFile = new RealTempFile();
    const fs = createFromRealFileSystem(tempFile);
    const serviceProvider = createServiceProvider(fs, console || new NullConsole(), tempFile);
    if (typeof configOptions === 'function') {
        configOptions = configOptions(serviceProvider);
    }
    // Always enable "test mode".
    configOptions.internalTestMode = true;
    const importResolver = new ImportResolver(serviceProvider, configOptions, new FullAccessHost(serviceProvider));

    return new Program(importResolver, configOptions, serviceProvider);
};

export function typeAnalyzeSampleFiles(
    fileNames: string[],
    configOptions: ConfigOptionsArg = new ConfigOptions(Uri.empty()),
    console?: ConsoleInterface
): FileAnalysisResult[] {
    const program = createProgram(configOptions, console);
    const fileUris = fileNames.map((name) => UriEx.file(resolveSampleFilePath(name)));
    program.setTrackedFiles(fileUris);

    // Set a "pre-check callback" so we can evaluate the types of each NameNode
    // prior to checking the full document. This will exercise the contextual
    // evaluation logic.
    program.setPreCheckCallback((parserOutput: ParserOutput, evaluator: TypeEvaluator) => {
        const nameTypeWalker = new NameTypeWalker(evaluator);
        nameTypeWalker.walk(parserOutput.parseTree);
    });

    const results = getAnalysisResults(program, fileUris, program.configOptions);

    program.dispose();
    program.serviceProvider.dispose();

    return results;
}

export const semanticTokenizeSampleFile = (fileName: string): SemanticTokenItem[] => {
    const program = createProgram();
    const fileUri = UriEx.file(resolveSampleFilePath(path.join('semantic_highlighting', fileName)));
    program.setTrackedFiles([fileUri]);
    const walker = new SemanticTokensWalker(program.evaluator!);
    walker.walk(program.getParseResults(fileUri)!.parserOutput.parseTree);
    program.dispose();
    return walker.items;
};

export const inlayHintSampleFile = (
    fileName: string,
    range?: Range,
    settings: Partial<InlayHintSettings> = {}
): TypeInlayHintsItemType[] => {
    const projectRoot = UriEx.file(resolveSampleFilePath(path.join('inlay_hints')));
    const program = createProgram(new ConfigOptions(projectRoot));
    const fileUri = projectRoot.combinePaths(fileName);
    program.setTrackedFiles([fileUri]);
    const walker = new TypeInlayHintsWalker(
        program,
        { callArgumentNames: true, functionReturnTypes: true, variableTypes: true, genericTypes: false, ...settings },
        fileUri,
        range
    );
    walker.walk(program.getParseResults(fileUri)!.parserOutput.parseTree);
    program.dispose();
    return walker.featureItems;
};

export function getAnalysisResults(
    program: Program,
    fileUris: Uri[],
    configOptions = new ConfigOptions(Uri.empty())
): FileAnalysisResult[] {
    // Always enable "test mode".
    configOptions.internalTestMode = true;

    while (program.analyze()) {
        // Continue to call analyze until it completes. Since we're not
        // specifying a timeout, it should complete the first time.
    }

    const sourceFileInfos = fileUris.flatMap((filePath) =>
        program
            .getSourceFileInfoList()
            // find notebook cells
            .filter((sourceFileInfo) => sourceFileInfo.sourceFile.getRealUri().equals(filePath))
    );
    return sourceFileInfos.map((sourceFileInfo, index) => {
        const sourceFile = sourceFileInfo.sourceFile;
        if (sourceFile) {
            const diagnostics = sourceFile.getDiagnostics(configOptions) || [];
            const fileUri = sourceFile.getUri();
            const analysisResult: FileAnalysisResult = {
                fileUri,
                cell: sourceFileInfo.cellIndex(),
                parseResults: sourceFile.getParseResults(),
                errors: diagnostics.filter((diag) => diag.category === DiagnosticCategory.Error),
                warnings: diagnostics.filter((diag) => diag.category === DiagnosticCategory.Warning),
                infos: diagnostics.filter((diag) => diag.category === DiagnosticCategory.Information),
                hints: diagnostics.filter((diag) => diag.category === DiagnosticCategory.Hint),
            };
            return analysisResult;
        } else {
            fail(`Source file not found for ${fileUris[index]}`);
        }
    });
}

/** @deprecated use {@link validateResultsButBased} instead */
export function validateResults(
    results: FileAnalysisResult[],
    errorCount: number,
    warningCount = 0,
    infoCount?: number,
    hint?: number
) {
    assert.strictEqual(results.length, 1);

    if (results[0].errors.length !== errorCount) {
        logDiagnostics(results[0].errors);
        assert.fail(`Expected ${errorCount} errors, got ${results[0].errors.length}`);
    }

    if (results[0].warnings.length !== warningCount) {
        logDiagnostics(results[0].warnings);
        assert.fail(`Expected ${warningCount} warnings, got ${results[0].warnings.length}`);
    }

    if (infoCount !== undefined) {
        if (results[0].infos.length !== infoCount) {
            logDiagnostics(results[0].infos);
            assert.fail(`Expected ${infoCount} infos, got ${results[0].infos.length}`);
        }
    }

    if (hint !== undefined) {
        if (results[0].hints.length !== hint) {
            logDiagnostics(results[0].hints);
            assert.fail(`Expected ${hint} hints, got ${results[0].hints.length}`);
        }
    }
}

function logDiagnostics(diags: Diagnostic[]) {
    for (const diag of diags) {
        console.error(`   [${diag.range.start.line + 1}:${diag.range.start.character + 1}] ${diag.message}`);
    }
}

interface ExpectedResult {
    message?: string;
    line: number;
    code?: DiagnosticRule;
    baselined?: boolean;
}

export type ExpectedResults = {
    [key in Exclude<keyof FileAnalysisResult, 'fileUri' | 'parseResults'>]?: ExpectedResult[];
};

export const validateResultsButBased = (
    allResults: FileAnalysisResult | FileAnalysisResult[],
    expectedResults: ExpectedResults
) => {
    let result: FileAnalysisResult;
    if (Array.isArray(allResults)) {
        assert.strictEqual(allResults.length, 1);
        result = allResults[0];
    } else {
        result = allResults;
    }
    for (const [diagnosticType] of entries(result)) {
        // TODO: this is gross, also update it so that you can specify expected notebook cells
        if (diagnosticType === 'fileUri' || diagnosticType === 'parseResults' || diagnosticType === 'cell') {
            continue;
        }
        const actualResult = result[diagnosticType].map(
            (result): ExpectedResult => ({
                message: result.message,
                line: result.range.start.line,
                code: result.getRule() as DiagnosticRule | undefined,
                baselined: result.baselined,
            })
        );
        const expectedResult = expectedResults[diagnosticType] ?? [];
        expect(new Set(actualResult)).toEqual(new Set(expectedResult.map(expect.objectContaining)));
    }
};
