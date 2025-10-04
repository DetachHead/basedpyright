import {
    CancellationToken,
    SemanticTokenModifiers,
    SemanticTokenTypes,
    SemanticTokens,
    SemanticTokensBuilder,
} from 'vscode-languageserver';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { ProgramView } from '../common/extensibility';
import { convertOffsetsToRange } from '../common/positionUtils';
import { Uri } from '../common/uri/uri';
import { ParseFileResults } from '../parser/parser';
import { SemanticTokensWalker } from '../analyzer/semanticTokensWalker';

export enum CustomSemanticTokenTypes {
    selfParameter = 'selfParameter',
    clsParameter = 'clsParameter',
}

export enum CustomSemanticTokenModifiers {
    /** built-in symbols (parity with pylance) */
    builtin = 'builtin',
    /** distinguishes class/instance variables, especially when these are types/functions/etc. */
    classMember = 'classMember',
    /**
     * Distinguishes function parameters.
     * Note that this custom modifier exists despite the `parameter` token type so that a parameter
     * with another token type (e.g. `function` or `class`) can still retain the information
     * about whether or not it is a parameter.
     */
    parameter = 'parameter',
}

export const tokenTypes: string[] = [
    SemanticTokenTypes.namespace,
    SemanticTokenTypes.type,
    SemanticTokenTypes.class,
    SemanticTokenTypes.enum,
    SemanticTokenTypes.typeParameter,
    SemanticTokenTypes.parameter,
    SemanticTokenTypes.variable,
    SemanticTokenTypes.property,
    SemanticTokenTypes.enumMember,
    SemanticTokenTypes.function,
    SemanticTokenTypes.method,
    SemanticTokenTypes.keyword,
    SemanticTokenTypes.decorator,
    CustomSemanticTokenTypes.selfParameter,
    CustomSemanticTokenTypes.clsParameter,
];

export const tokenModifiers: string[] = [
    SemanticTokenModifiers.declaration,
    SemanticTokenModifiers.definition,
    SemanticTokenModifiers.readonly,
    SemanticTokenModifiers.static,
    SemanticTokenModifiers.async,
    SemanticTokenModifiers.defaultLibrary,
    CustomSemanticTokenModifiers.builtin,
    CustomSemanticTokenModifiers.classMember,
    CustomSemanticTokenModifiers.parameter,
];

export const SemanticTokensProviderLegend = {
    tokenTypes: tokenTypes,
    tokenModifiers: tokenModifiers,
};

function encodeTokenType(type: string): number {
    const idx = tokenTypes.indexOf(type);
    if (idx === -1) {
        throw new Error(`Unknown token type: ${type}`);
    }
    return idx;
}

function encodeTokenModifiers(modifiers: string[]): number {
    let data = 0;
    for (const t of modifiers) {
        const idx = tokenModifiers.indexOf(t);
        if (idx === undefined) {
            continue;
        }
        data |= 1 << idx;
    }
    return data;
}

export class SemanticTokensProvider {
    private readonly _parseResults: ParseFileResults | undefined;

    constructor(private _program: ProgramView, private _fileUri: Uri, private _token: CancellationToken) {
        this._parseResults = this._program.getParseResults(this._fileUri);
    }

    onSemanticTokens(): SemanticTokens {
        const builder = new SemanticTokensBuilder();
        if (!this._parseResults) {
            return builder.build();
        }

        const walker = new SemanticTokensWalker(this._program.evaluator!);
        walker.walk(this._parseResults.parserOutput.parseTree);

        throwIfCancellationRequested(this._token);

        // seems that tokens are lost if they show up out of order. TODO: figure out if there's a proper way to fix this
        walker.items.sort((a, b) => a.start - b.start);

        for (const item of walker.items) {
            const range = convertOffsetsToRange(
                item.start,
                item.start + item.length,
                this._parseResults.tokenizerOutput.lines
            );
            builder.push(
                range.start.line,
                range.start.character,
                item.length,
                encodeTokenType(item.type),
                encodeTokenModifiers(item.modifiers)
            );
        }

        return builder.build();
    }
}
