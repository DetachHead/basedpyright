/*
 * codeActionProvider.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Handles 'code actions' requests from the client.
 */

import { CancellationToken, CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver';

import { Commands } from '../commands/commands';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { createCommand } from '../common/commandUtils';
import { CreateTypeStubFileAction, Diagnostic } from '../common/diagnostic';
import { Range, TextRange } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { convertToFileTextEdits, convertToTextEditActions, convertToWorkspaceEdit } from '../common/workspaceEditUtils';
import { Localizer } from '../localization/localize';
import { Workspace } from '../workspaceFactory';
import { CompletionMap, CompletionProvider } from './completionProvider';
import {
    convertOffsetToPosition,
    convertPositionToOffset,
    convertTextRangeToRange,
    getLineEndPosition,
} from '../common/positionUtils';
import { findNodeByOffset, findNodeByPosition } from '../analyzer/parseTreeUtils';
import { FunctionNode, ModuleNode, ParseNode, ParseNodeType } from '../parser/parseNodes';
import { sorter } from '../common/collectionUtils';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { DiagnosticRule } from '../common/diagnosticRules';
import { TextRangeCollection } from '../common/textRangeCollection';
import { FunctionType, isOverloaded, OverloadedType } from '../analyzer/types';
import { ParseFileResults } from '../parser/parser';
import { FileSystem } from '../common/fileSystem';

export class CodeActionProvider {
    static mightSupport(kinds: CodeActionKind[] | undefined): boolean {
        if (!kinds || kinds.length === 0) {
            return true;
        }

        // Only support quick fix actions
        return kinds.some((s) => s.startsWith(CodeActionKind.QuickFix));
    }

    static async getCodeActionsForPosition(
        workspace: Workspace,
        fileUri: Uri,
        range: Range,
        kinds: CodeActionKind[] | undefined,
        token: CancellationToken,
        ls: LanguageServerInterface
    ) {
        throwIfCancellationRequested(token);

        const codeActions: CodeAction[] = [];
        if (workspace.disableLanguageServices) {
            return codeActions;
        }

        if (!this.mightSupport(kinds)) {
            // Early exit if code actions are going to be filtered anyway.
            return codeActions;
        }

        const diags = await workspace.service.getDiagnosticsForRange(fileUri, range, token);

        const parseResults = workspace.service.backgroundAnalysisProgram.program.getParseResults(fileUri)!;
        const parseTree = parseResults.parserOutput.parseTree;
        const lines = parseResults.tokenizerOutput.lines;

        const fs = ls.serviceProvider.fs();

        codeActions.push(...this._addImportActions(workspace, fileUri, range, token, ls, lines, diags, parseTree));

        const createTypeStubAction = this._createTypeStubAction(workspace, fileUri, diags);
        if (createTypeStubAction) {
            codeActions.push(createTypeStubAction);
        }

        for (const diagnostic of diags) {
            const rule = diagnostic.getRule();
            if (!rule) {
                continue;
            }
            const line = diagnostic.range.start.line;

            if (rule === DiagnosticRule.reportImplicitOverride) {
                const action = this._addOverrideAction(workspace, fileUri, line, token, ls, fs, lines, parseResults);
                if (action) {
                    codeActions.push(action);
                }
            }

            if (rule === DiagnosticRule.reportUnnecessaryCast) {
                const action = this._removeUnnecessaryCastAction(
                    workspace,
                    fileUri,
                    ls,
                    fs,
                    lines,
                    parseTree,
                    diagnostic.range
                );
                if (action) {
                    codeActions.push(action);
                }
            }

            if (rule === DiagnosticRule.reportUnusedCallResult) {
                codeActions.push(this._addAssignToUnderscoreAction(fileUri, ls, fs, diagnostic.range));
            }

            if (rule === DiagnosticRule.reportSelfClsDefault) {
                const action = this._removeSelfClsDefaultAction(fileUri, ls, fs, lines, parseTree, diagnostic.range);
                if (action) {
                    codeActions.push(action);
                }
            }
        }

        codeActions.push(...this._addIgnoreCommentActions(fileUri, ls, fs, lines, diags, parseResults));

        return codeActions;
    }

    private static _addAssignToUnderscoreAction(
        fileUri: Uri,
        ls: LanguageServerInterface,
        fs: FileSystem,
        range: Range
    ) {
        // Suggestion to assign the result to `_`
        // Insert an edit at the start of the diagnostic range
        const position = range.start;
        const insertText = '_ = ';
        return CodeAction.create(
            Localizer.CodeAction.assignToUnderscore(),
            convertToWorkspaceEdit(
                ls.convertUriToLspUriString,
                fs,
                convertToFileTextEdits(
                    fileUri,
                    convertToTextEditActions([{ newText: insertText, range: { start: position, end: position } }])
                )
            ),
            CodeActionKind.QuickFix
        );
    }

    private static _addIgnoreCommentActions(
        fileUri: Uri,
        ls: LanguageServerInterface,
        fs: FileSystem,
        lines: TextRangeCollection<TextRange>,
        diags: Diagnostic[],
        parseResults: ParseFileResults
    ) {
        const codeActions: CodeAction[] = [];
        for (const diagnostic of diags) {
            const rule = diagnostic.getRule();
            if (!rule || rule === DiagnosticRule.reportImportCycles) {
                // this action should not work on reportImportCycles since strange behaviors on it.
                // see https://github.com/DetachHead/basedpyright/issues/1312
                continue;
            }

            const line = diagnostic.range.start.line;
            const ignoreCommentPrefix = `# pyright: ignore`;
            // we deliberately only check for pyright:ignore comments here but not type:ignore for 2 reasons:
            // - type:ignore comments are discouraged in favor of pyright:ignore comments
            // - the type:ignore comment might be for another type checker
            const existingIgnoreComment = parseResults.tokenizerOutput.pyrightIgnoreLines.get(line);
            let title: string;
            let positionCharacter: number;
            let insertText: string;
            if (existingIgnoreComment) {
                const lastRuleTextRange = existingIgnoreComment.rulesList.at(-1)?.range;
                if (!lastRuleTextRange) {
                    continue;
                }
                positionCharacter = convertTextRangeToRange(lastRuleTextRange, lines).end.character;
                insertText = `, ${rule}`;
                title = Localizer.CodeAction.addIgnoreCommentToExisting().format({
                    rule: rule,
                    ignoreCommentPrefix: ignoreCommentPrefix,
                });
            } else {
                positionCharacter = getLineEndPosition(parseResults.tokenizerOutput, parseResults.text, line).character;
                const ignoreComment = `${ignoreCommentPrefix}[${rule}]`;
                insertText = `  ${ignoreComment}`;
                title = Localizer.CodeAction.addIgnoreComment().format({ ignoreComment: ignoreComment });
            }
            const position = { line, character: positionCharacter };
            codeActions.push(
                CodeAction.create(
                    title,
                    convertToWorkspaceEdit(
                        ls.convertUriToLspUriString,
                        fs,
                        convertToFileTextEdits(
                            fileUri,
                            convertToTextEditActions([
                                { newText: insertText, range: { start: position, end: position } },
                            ])
                        )
                    ),
                    CodeActionKind.QuickFix
                )
            );
        }
        return codeActions;
    }

    private static _addImportActions(
        workspace: Workspace,
        fileUri: Uri,
        range: Range,
        token: CancellationToken,
        ls: LanguageServerInterface,
        lines: TextRangeCollection<TextRange>,
        diags: Diagnostic[],
        parseTree: ModuleNode
    ) {
        const codeActions: CodeAction[] = [];

        for (const diagnostic of diags) {
            const rule = diagnostic.getRule();
            if (!rule) {
                continue;
            }

            if (diagnostic.getActions()?.some((action) => action.action === Commands.import)) {
                const node = findNodeByPosition(parseTree, range.start, lines);
                if (node === undefined) {
                    return [];
                }

                const completer = this._createCompleter(workspace, fileUri, token, node, lines);

                const word = node.nodeType === ParseNodeType.Name ? node.d.value : undefined;
                const sortedCompletions = completer
                    .getCompletions()
                    ?.items.filter(
                        (completion) =>
                            // only show exact matches as code actions, which matches pylance's behavior. otherwise it's too noisy
                            // because code actions don't get sorted like completions do. see https://github.com/DetachHead/basedpyright/issues/747
                            completion.label === word
                    )
                    .sort((prev, next) =>
                        sorter(
                            prev,
                            next,
                            (prev, next) => (prev.sortText && next.sortText && prev.sortText < next.sortText) || false
                        )
                    );

                for (const suggestedImport of sortedCompletions ?? []) {
                    if (!suggestedImport.data) {
                        continue;
                    }
                    let textEdits: TextEdit[] = [];
                    if (suggestedImport.textEdit && 'range' in suggestedImport.textEdit) {
                        textEdits.push(suggestedImport.textEdit);
                    }
                    if (suggestedImport.additionalTextEdits) {
                        textEdits = textEdits.concat(suggestedImport.additionalTextEdits);
                    }
                    if (textEdits.length === 0) {
                        continue;
                    }
                    const workspaceEdit = convertToWorkspaceEdit(
                        ls.convertUriToLspUriString,
                        completer.importResolver.fileSystem,
                        convertToFileTextEdits(fileUri, convertToTextEditActions(textEdits))
                    );
                    codeActions.push(
                        CodeAction.create(
                            suggestedImport.data.autoImportText.trim(),
                            workspaceEdit,
                            CodeActionKind.QuickFix
                        )
                    );
                }
            }
        }

        return codeActions;
    }

    private static _addOverrideAction(
        workspace: Workspace,
        fileUri: Uri,
        line: number,
        token: CancellationToken,
        ls: LanguageServerInterface,
        fs: FileSystem,
        lines: TextRangeCollection<TextRange>,
        parseResults: ParseFileResults
    ) {
        const lineText = lines.getItemAt(line);
        const methodLineContent = parseResults.text.substring(lineText.start, lineText.start + lineText.length);

        const functionLine = { line: line, character: 0 };
        const offset = convertPositionToOffset(functionLine, lines);
        if (offset === undefined) {
            return;
        }

        const node = findNodeByOffset(parseResults.parserOutput.parseTree, offset);
        if (node === undefined) {
            return;
        }

        const completer = this._createCompleter(workspace, fileUri, token, node, lines);
        const completionMap = new CompletionMap();

        const overrideEdits = completer.createOverrideEdits(
            node as FunctionNode,
            offset,
            undefined,
            methodLineContent,
            completionMap
        );

        if (overrideEdits.length > 0) {
            return CodeAction.create(
                Localizer.CodeAction.addExplicitOverride(),
                convertToWorkspaceEdit(ls.convertUriToLspUriString, fs, convertToFileTextEdits(fileUri, overrideEdits)),
                CodeActionKind.QuickFix
            );
        }

        return;
    }

    private static _createCompleter(
        workspace: Workspace,
        fileUri: Uri,
        token: CancellationToken,
        node: ParseNode,
        lines: TextRangeCollection<TextRange>
    ) {
        return new CompletionProvider(
            workspace.service.backgroundAnalysisProgram.program,
            fileUri,
            convertOffsetToPosition(node.start + node.length, lines),
            {
                format: 'plaintext',
                lazyEdit: false,
                snippet: false,
                // we don't care about deprecations here so make sure they don't get evaluated unnecessarily
                // (we don't call resolveCompletionItem)
                checkDeprecatedWhenResolving: true,
                useTypingExtensions: workspace.useTypingExtensions,
            },
            token,
            true
        );
    }

    private static _createTypeStubAction(workspace: Workspace, fileUri: Uri, diags: Diagnostic[]) {
        const typeStubDiag = diags.find((d) => {
            const actions = d.getActions();
            return actions && actions.find((a) => a.action === Commands.createTypeStub);
        });

        if (workspace.rootUri && typeStubDiag) {
            const action = typeStubDiag
                .getActions()!
                .find((a) => a.action === Commands.createTypeStub) as CreateTypeStubFileAction;
            if (action) {
                const createTypeStubAction = CodeAction.create(
                    Localizer.CodeAction.createTypeStubFor().format({ moduleName: action.moduleName }),
                    createCommand(
                        Localizer.CodeAction.createTypeStub(),
                        Commands.createTypeStub,
                        workspace.rootUri.toString(),
                        action.moduleName,
                        fileUri.toString()
                    ),
                    CodeActionKind.QuickFix
                );
                return createTypeStubAction;
            }
        }
        return;
    }

    private static _removeSelfClsDefaultAction(
        fileUri: Uri,
        ls: LanguageServerInterface,
        fs: FileSystem,
        lines: TextRangeCollection<TextRange>,
        parseTree: ModuleNode,
        range: Range
    ) {
        // remove the default value from 'self' or 'cls' parameter
        const lineText = lines.getItemAt(range.start.line);
        let paramNode = findNodeByOffset(parseTree, range.start.character + lineText.start);
        let editStartOffset: number | undefined;
        let editEndOffset: number | undefined;
        if (!paramNode) {
            return;
        }
        while (paramNode?.nodeType !== ParseNodeType.Parameter) {
            paramNode = paramNode?.parent;
        }
        const paramName = paramNode.d.name?.d.value;

        if (paramNode.d.defaultValue) {
            if (paramNode.d.annotation) {
                editStartOffset = paramNode.d.annotation.start + paramNode.d.annotation.length;
            } else if (paramNode.d.name) {
                editStartOffset = paramNode.d.name.start + paramNode.d.name.length;
            } else {
                editStartOffset = undefined;
            }
            editEndOffset = paramNode.d.defaultValue.start + paramNode.d.defaultValue.length;
        }

        if (!paramName || editStartOffset === undefined || editEndOffset === undefined) {
            return;
        }

        const startPos = convertOffsetToPosition(editStartOffset, lines);
        const endPos = convertOffsetToPosition(editEndOffset, lines);
        return CodeAction.create(
            Localizer.CodeAction.removeParamDefault().format({ paramName }),
            convertToWorkspaceEdit(
                ls.convertUriToLspUriString,
                fs,
                convertToFileTextEdits(
                    fileUri,
                    convertToTextEditActions([{ newText: '', range: { start: startPos, end: endPos } }])
                )
            ),
            CodeActionKind.QuickFix
        );
    }

    private static _removeUnnecessaryCastAction(
        workspace: Workspace,
        fileUri: Uri,
        ls: LanguageServerInterface,
        fs: FileSystem,
        lines: TextRangeCollection<TextRange>,
        parseTree: ModuleNode,
        range: Range
    ) {
        // Suggestion to remove the cast call
        const lineText = lines.getItemAt(range.start.line);

        let node = findNodeByOffset(parseTree, range.start.character + lineText.start);
        if (!node) {
            return;
        }
        while (node) {
            if (node.nodeType === ParseNodeType.Call) {
                const evaluator = workspace.service.backgroundAnalysisProgram.program.evaluator!;
                const type = evaluator.getTypeOfExpression(node.d.leftExpr).type;
                if (isOverloaded(type)) {
                    // typing.cast / typing_extensions.cast is an overloaded function in stubs
                    const overloads = OverloadedType.getOverloads(type);
                    if (
                        overloads.some((overload) =>
                            FunctionType.isBuiltIn(overload, ['typing.cast', 'typing_extensions.cast'])
                        )
                    ) {
                        break;
                    }
                }
            }
            node = node.parent;
        }
        if (!node || node.nodeType !== ParseNodeType.Call) {
            return;
        }

        const valueArg = node.d.args[1];
        const valueStartPosition = convertOffsetToPosition(valueArg.start, lines);
        const valueEndPosition = convertOffsetToPosition(valueArg.start + valueArg.length, lines);
        const castCallOpeningRange = {
            start: convertOffsetToPosition(node.start, lines),
            end: valueStartPosition,
        };
        const castCallClosingRange = {
            start: valueEndPosition,
            end: convertOffsetToPosition(node.start + node.length, lines),
        };
        if (valueStartPosition && valueEndPosition) {
            return CodeAction.create(
                Localizer.CodeAction.removeUnnecessaryCast(),
                convertToWorkspaceEdit(
                    ls.convertUriToLspUriString,
                    fs,
                    convertToFileTextEdits(
                        fileUri,
                        convertToTextEditActions([
                            {
                                newText: '',
                                range: castCallOpeningRange,
                            },
                            {
                                newText: '',
                                range: castCallClosingRange,
                            },
                        ])
                    )
                ),
                CodeActionKind.QuickFix
            );
        }

        return;
    }
}
