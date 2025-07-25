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
import { ActionKind, CreateTypeStubFileAction, RenameShadowedFileAction } from '../common/diagnostic';
import { FileEditActions } from '../common/editAction';
import { Range } from '../common/textRange';
import { Uri } from '../common/uri/uri';
import { convertToFileTextEdits, convertToTextEditActions, convertToWorkspaceEdit } from '../common/workspaceEditUtils';
import { Localizer } from '../localization/localize';
import { Workspace } from '../workspaceFactory';
import { CompletionProvider } from './completionProvider';
import {
    convertOffsetToPosition,
    convertPositionToOffset,
    convertTextRangeToRange,
    getLineEndPosition,
} from '../common/positionUtils';
import { findNodeByOffset } from '../analyzer/parseTreeUtils';
import { ParseNodeType } from '../parser/parseNodes';
import { sorter } from '../common/collectionUtils';
import { LanguageServerInterface } from '../common/languageServerInterface';

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
        const lines = parseResults.tokenizerOutput.lines;

        if (diags.find((d) => d.getActions()?.some((action) => action.action === Commands.import))) {
            const offset = convertPositionToOffset(range.start, lines);
            if (offset === undefined) {
                return [];
            }

            const node = findNodeByOffset(parseResults.parserOutput.parseTree, offset);
            if (node === undefined) {
                return [];
            }

            const completer = new CompletionProvider(
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
                    ls,
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

        if (!workspace.rootUri) {
            return codeActions;
        }

        const typeStubDiag = diags.find((d) => {
            const actions = d.getActions();
            return actions && actions.find((a) => a.action === Commands.createTypeStub);
        });

        if (typeStubDiag) {
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
                codeActions.push(createTypeStubAction);
            }
        }

        const renameShadowed = diags.find((d) => {
            const actions = d.getActions();
            return actions && actions.find((a) => a.action === ActionKind.RenameShadowedFileAction);
        });
        if (renameShadowed) {
            const action = renameShadowed
                .getActions()!
                .find((a) => a.action === ActionKind.RenameShadowedFileAction) as RenameShadowedFileAction;
            if (action) {
                const title = Localizer.CodeAction.renameShadowedFile().format({
                    oldFile: action.oldUri.getShortenedFileName(),
                    newFile: action.newUri.getShortenedFileName(),
                });
                const editActions: FileEditActions = {
                    edits: [],
                    fileOperations: [
                        {
                            kind: 'rename',
                            oldFileUri: action.oldUri,
                            newFileUri: action.newUri,
                        },
                    ],
                };
                const workspaceEdit = convertToWorkspaceEdit(ls, workspace.service.fs, editActions);
                const renameAction = CodeAction.create(title, workspaceEdit, CodeActionKind.QuickFix);
                codeActions.push(renameAction);
            }
        }

        const fs = ls.serviceProvider.fs();
        for (const diagnostic of diags) {
            const rule = diagnostic.getRule();
            if (!rule) {
                continue;
            }
            const ignoreCommentPrefix = `# pyright: ignore`;
            const line = diagnostic.range.start.line;
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
                title = `Add \`${rule}\` to existing \`${ignoreCommentPrefix}\` comment`;
            } else {
                positionCharacter = getLineEndPosition(parseResults.tokenizerOutput, parseResults.text, line).character;
                const ignoreComment = `${ignoreCommentPrefix}[${rule}]`;
                insertText = `  ${ignoreComment}`;
                title = `Add \`${ignoreComment}\``;
            }
            const position = { line, character: positionCharacter };
            codeActions.push(
                CodeAction.create(
                    title,
                    convertToWorkspaceEdit(
                        ls,
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
}
