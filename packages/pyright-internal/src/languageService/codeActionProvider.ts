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
import { convertOffsetToPosition, convertPositionToOffset } from '../common/positionUtils';
import { findNodeByOffset } from '../analyzer/parseTreeUtils';

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
        token: CancellationToken
    ) {
        throwIfCancellationRequested(token);

        const codeActions: CodeAction[] = [];
        if (!workspace.rootUri || workspace.disableLanguageServices) {
            return codeActions;
        }

        if (!this.mightSupport(kinds)) {
            // Early exit if code actions are going to be filtered anyway.
            return codeActions;
        }

        const diags = await workspace.service.getDiagnosticsForRange(fileUri, range, token);
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
                const workspaceEdit = convertToWorkspaceEdit(workspace.service.fs, editActions);
                const renameAction = CodeAction.create(title, workspaceEdit, CodeActionKind.QuickFix);
                codeActions.push(renameAction);
            }
        }
        if (diags.find((d) => d.getActions()?.some((action) => action.action === Commands.import))?.getActions()) {
            const parseResults = workspace.service.backgroundAnalysisProgram.program.getParseResults(fileUri)!;
            const lines = parseResults.tokenizerOutput.lines;
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
                },
                token
            );
            for (const suggestedImport of completer.getCompletions()?.items ?? []) {
                if (!suggestedImport.data) {
                    continue;
                }
                completer.resolveCompletionItem(suggestedImport);
                if (!completer.itemToResolve) {
                    continue;
                }
                let textEdits: TextEdit[] = [];
                if (completer.itemToResolve.textEdit && 'range' in completer.itemToResolve.textEdit) {
                    textEdits.push(completer.itemToResolve.textEdit);
                }
                if (completer.itemToResolve.additionalTextEdits) {
                    textEdits = textEdits.concat(completer.itemToResolve.additionalTextEdits);
                }
                if (textEdits.length === 0) {
                    continue;
                }
                const workspaceEdit = convertToWorkspaceEdit(
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

        return codeActions;
    }
}
