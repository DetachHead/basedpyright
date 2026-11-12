/*
 * docStringConversion.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Python doc string to markdown/plain text format conversion.
 */

import { isIdentifierChar, isIdentifierStartChar } from '../parser/characters';

import { cleanAndSplitDocString, cleanAndSplitDocStringLines } from './docStringUtils';

// Converts a docstring to markdown format.
//
// This does various things, including removing common indention, escaping
// characters, handling code blocks, and more.
//
// This is a straight port of
// https://github.com/microsoft/python-language-server/blob/master/src/LanguageServer/Impl/Documentation/DocstringConverter.cs
//
// The restructured npm library was evaluated, and while it worked well for
// parsing valid input, it was going to be more difficult to handle invalid
// RST input.
export function convertDocStringToMarkdown(docString: string, forceLiteral = false): string {
    return new DocStringConverter(docString, forceLiteral).convert();
}

//  Converts a docstring to a plaintext, human readable form. This will
//  first strip any common leading indention (like inspect.cleandoc),
//  then remove duplicate empty/whitespace lines.
export function convertDocStringToPlainText(docString: string): string {
    const lines = cleanAndSplitDocString(docString);
    const output: string[] = [];

    for (const line of lines) {
        const last = output.length > 0 ? output[output.length - 1] : undefined;
        if (_isUndefinedOrWhitespace(line) && _isUndefinedOrWhitespace(last)) {
            continue;
        }

        output.push(line);
    }

    return output.join('\n').trimEnd();
}

interface RegExpReplacement {
    exp: RegExp;
    replacement: string;
}

// Regular expressions for one match
const LeadingSpaceCountRegExp = /\S|$/;
const NonWhitespaceRegExp = /\S/;
const TildaHeaderRegExp = /^\s*~~~+$/;
const PlusHeaderRegExp = /^\s*\+\+\++$/;
const EqualHeaderRegExp = /^\s*===+\s+===+$/;
const DashHeaderRegExp = /^\s*---+\s+---+$/;
const LeadingDashListRegExp = /^(\s*)-\s/;
const LeadingAsteriskListRegExp = /^(\s*)\*\s/;
const LeadingNumberListRegExp = /^(\s*)\d+\.\s/;
const LeadingAsteriskRegExp = /^(\s+\* )(.*)$/;
const SpaceDotDotRegExp = /^\s*\.\. /;
const DirectiveLikeRegExp = /^\s*\.\.\s+(.*)::\s*(.*)$/;
const DoctestRegExp = / *>>> /;
const DirectivesExtraNewlineRegExp = /^\s*:(param|arg|type|return|rtype|raise|except|var|ivar|cvar|copyright|license)/;
const epyDocFieldTokensRegExp = /^\.[\s\t]+(@\w)/gm; // cv2 has leading '.' http://epydoc.sourceforge.net/manual-epytext.html
const epyDocCv2FixRegExp = /^(\.\s{3})|^(\.)/;

const PotentialHeaders: RegExpReplacement[] = [
    { exp: /^\s*=+(\s+=+)+$/, replacement: '=' },
    { exp: /^\s*-+(\s+-+)+$/, replacement: '-' },
    { exp: /^\s*~+(\s+-+)+$/, replacement: '~' },
    { exp: /^\s*\++(\s+\++)+$/, replacement: '+' },
];

// Regular expressions for replace all
const WhitespaceRegExp = /\s/g;
const DoubleTickRegExp = /``/g;
const TildeRegExp = /~/g;
const PlusRegExp = /\+/g;
const MarkdownCharsRegExp = /[_*~[\]]/g;
const linkRegExp = /(\[.*\]\(.*\))/g;

const CodeBlockStartRegExp = /^\s*(?<block>`{3}(?!`)|~{3}(?!~))(\w*)/;
const CodeBlockEndRegExp = /^\s*(?<block>`{3}(?!`)|~{3}(?!~))/;

const HtmlEscapes: RegExpReplacement[] = [
    { exp: /</g, replacement: '&lt;' },
    { exp: />/g, replacement: '&gt;' },
];

const MarkdownLineBreak = '  \n';
// http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#literal-blocks
const LiteralBlockEmptyRegExp = /^\s*::$/;
const LiteralBlockReplacements: RegExpReplacement[] = [
    { exp: /\s+::$/g, replacement: '' },
    { exp: /(\S)\s*::$/g, replacement: '$1:' },
    // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#interpreted-text
    { exp: /:[\w_\-+:.]+:`/g, replacement: '`' },
    { exp: /`:[\w_\-+:.]+:/g, replacement: '`' },
];

type SectionKind = 'fields' | 'prose';

// Case-sensitive, so "args:" is not a section.
// ambiguous: also a plain heading, so claim it only when the body is "name: description".
const GoogleSections: Record<string, { kind: SectionKind; ambiguous?: true }> = {
    Args: { kind: 'fields', ambiguous: true },
    Attributes: { kind: 'fields', ambiguous: true },
    Returns: { kind: 'prose' },
    Yields: { kind: 'prose' },
    Raises: { kind: 'fields' },
    Example: { kind: 'prose' },
    Examples: { kind: 'prose' },
};

// Converter is a state machine, where the current state is a function which
// will be run (and change the state again) until completion.
type State = () => void;

interface RestTableState {
    header: string;
    inHeader: boolean;
}

interface CodeBlockState {
    kind: 'fenced' | 'doctest';
    fence: string;
    indent: number;
    outputIndent: string;
}

interface SectionState {
    kind: SectionKind;
    headerLine: number;
    bodyIndent: number | undefined;
    entryOpen: boolean;
    codeBlock: CodeBlockState | undefined;
    continuationIndent: number | undefined;
}

interface FieldEntry {
    name: string;
    type?: string;
    qualifier?: string;
    description: string;
}

class DocStringConverter {
    private _builder = '';
    private _skipAppendEmptyLine = true;
    private _insideInlineCode = false;
    private _appendDirectiveBlock = false;

    private _state: State;
    private _stateStack: State[] = [];
    private _input: string;

    private _lines: string[];
    // Indent before dedent. A first-line "Args:" can collapse onto its body.
    private _rawIndents: number[];
    private _rawIndexes: number[];
    private _lineNum = 0;

    private _blockIndent = 0;

    private _tableState: RestTableState | undefined;
    private _lastBacktickString: string | undefined;

    private _lastLineWasPlainText = false;

    private _section: SectionState | undefined;

    constructor(input: string, private _forceLiteral = false) {
        this._state = this._parseText;
        this._input = input;
        const cleaned = cleanAndSplitDocStringLines(input);
        this._lines = cleaned.map((line) => line.text);
        this._rawIndents = cleaned.map((line) => line.rawIndent);
        this._rawIndexes = cleaned.map((line) => line.rawIndex);
    }

    convert(): string {
        const isEpyDoc = epyDocFieldTokensRegExp.test(this._input);
        if (isEpyDoc) {
            // fixup cv2 leading '.'
            this._lines = this._lines.map((v) => v.replace(epyDocCv2FixRegExp, ''));
        }

        while (this._currentLineOrUndefined() !== undefined) {
            const before = this._state;
            const beforeLine = this._lineNum;

            this._state();

            // Parser must make progress; either the state or line number must change.
            if (this._state === before && this._lineNum === beforeLine) {
                break;
            }
        }

        // Close out any outstanding code blocks.
        if (
            this._state === this._parseBacktickBlock ||
            this._state === this._parseDocTest ||
            this._state === this._parseLiteralBlock
        ) {
            // See what the current backtick block is. We want to match it.
            this._trimOutputAndAppendLine(this._lastBacktickString || '```');
        } else if (this._state === this._parseSection && this._section?.codeBlock) {
            this._closeSectionCodeBlock(this._section);
        } else if (this._insideInlineCode) {
            this._trimOutputAndAppendLine('`', /* noNewLine */ true);
        }

        return this._builder.trim();
    }

    private _eatLine() {
        this._lineNum++;
    }

    private _currentLineOrUndefined(): string | undefined {
        return this._lineNum < this._lines.length ? this._lines[this._lineNum] : undefined;
    }

    private _currentLine(): string {
        return this._currentLineOrUndefined() || '';
    }

    private _currentIndent(): number {
        return _countLeadingSpaces(this._currentLine());
    }

    private _prevIndent(): number {
        return _countLeadingSpaces(this._lineAt(this._lineNum - 1) ?? '');
    }

    private _lineAt(i: number): string | undefined {
        return i < this._lines.length ? this._lines[i] : undefined;
    }

    private _nextBlockIndent(): number {
        return _countLeadingSpaces(
            this._lines.slice(this._lineNum + 1).find((v) => !_isUndefinedOrWhitespace(v)) || ''
        );
    }

    private _currentLineIsOutsideBlock(): boolean {
        return this._currentIndent() < this._blockIndent;
    }

    private _pushAndSetState(next: State): void {
        if (this._state === this._parseText) {
            this._insideInlineCode = false;
        }

        this._stateStack.push(this._state);
        this._state = next;
    }

    private _popState(): void {
        this._state = this._stateStack.splice(0, 1)[0];

        if (this._state === this._parseText) {
            // Terminate inline code when leaving a block.
            this._insideInlineCode = false;
        }
    }

    private _parseText(): void {
        if (_isUndefinedOrWhitespace(this._currentLineOrUndefined())) {
            this._state = this._parseEmpty;
            return;
        }

        if (this._beginBacktickBlock()) {
            return;
        }

        if (this._beginLiteralBlock()) {
            return;
        }

        if (this._beginDocTest()) {
            return;
        }

        if (this._beginDirective()) {
            return;
        }

        if (this._beginList()) {
            return;
        }

        if (this._beginFieldList()) {
            return;
        }

        if (this._beginTableBlock()) {
            return;
        }

        const line = this._formatPlainTextIndent(this._currentLine());

        if (this._forceLiteral && this._lastLineWasPlainText && !this._insideInlineCode) {
            this._convertTrailingSoftLineBreak();
        }

        this._appendTextLine(line);
        // Must come after _appendTextLine, which resets the flag on entry.
        this._lastLineWasPlainText = true;
        this._eatLine();
    }

    private _formatPlainTextIndent(line: string) {
        const prev = this._lineAt(this._lineNum - 1);
        const prevIndent = this._prevIndent();
        const currIndent = this._currentIndent();

        if (currIndent > prevIndent && !_isUndefinedOrWhitespace(prev) && !_isHeader(prev)) {
            this._convertTrailingSoftLineBreak();
        }

        if (prevIndent > currIndent && !_isUndefinedOrWhitespace(prev)) {
            this._convertTrailingSoftLineBreak();
        }

        if (
            (this._forceLiteral && !this._insideInlineCode) ||
            prevIndent === 0 ||
            this._builder.endsWith(MarkdownLineBreak) ||
            this._builder.endsWith('\n\n')
        ) {
            line = this._convertIndent(line);
        } else {
            line = line.trimStart();
        }
        return line;
    }

    private _convertTrailingSoftLineBreak(): void {
        if (
            this._builder.endsWith('\n') &&
            !this._builder.endsWith(MarkdownLineBreak) &&
            !this._builder.endsWith('\n\n')
        ) {
            this._builder = this._builder.slice(0, -1) + MarkdownLineBreak;
        }
    }

    private _convertIndent(line: string) {
        line = line.replace(/^([ \t]+)(.+)$/g, (_match, g1, g2) => '&nbsp;'.repeat(g1.length) + g2);
        return line;
    }

    private _escapeHtml(line: string): string {
        HtmlEscapes.forEach((escape) => {
            line = line.replace(escape.exp, escape.replacement);
        });

        return line;
    }

    private _appendTextLine(line: string): void {
        this._lastLineWasPlainText = false;

        line = this._preprocessTextLine(line);

        const parts = line.split('`');

        for (let i = 0; i < parts.length; i++) {
            let part = parts[i];

            if (i > 0) {
                this._insideInlineCode = !this._insideInlineCode;
                this._append('`');
            }

            if (this._insideInlineCode) {
                this._append(part);
                continue;
            }

            part = this._escapeHtml(part);

            if (i === 0) {
                // Only one part, and not inside code, so check header cases.
                if (parts.length === 1) {
                    // Handle weird separator lines which contain random spaces.
                    for (const expReplacement of PotentialHeaders) {
                        if (expReplacement.exp.test(part)) {
                            part = part.replace(WhitespaceRegExp, expReplacement.replacement);
                            break;
                        }
                    }

                    // Replace ReST style ~~~ header to prevent it being interpreted as a code block
                    // (an alternative in Markdown to triple backtick blocks).
                    if (TildaHeaderRegExp.test(part)) {
                        this._append(part.replace(TildeRegExp, '-'));
                        continue;
                    }

                    // Replace +++ heading too.
                    // TODO: Handle the rest of these, and the precedence order (which depends on the
                    // order heading lines are seen, not what the line contains).
                    // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#sections
                    if (PlusHeaderRegExp.test(part)) {
                        this._append(part.replace(PlusRegExp, '-'));
                        continue;
                    }
                }

                // Don't strip away asterisk-based bullet point lists.
                //
                // TODO: Replace this with real list parsing. This may have
                // false positives and cause random italics when the ReST list
                // doesn't match Markdown's specification.
                const match = LeadingAsteriskRegExp.exec(part);
                if (match !== null && match.length === 3) {
                    this._append(match[1]);
                    part = match[2];
                }
            }

            // TODO: Find a better way to handle this; the below breaks escaped
            // characters which appear at the beginning or end of a line.
            // Applying this only when i == 0 or i == parts.Length-1 may work.

            // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#hyperlink-references
            // part = RegExp.Replace(part, @"^_+", "");
            // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#inline-internal-targets
            // part = RegExp.Replace(part, @"_+$", "");

            // TODO: Strip footnote/citation references.

            // Escape _, *, and ~, but ignore things like ":param \*\*kwargs:".
            const subparts = part.split(linkRegExp);
            subparts.forEach((item) => {
                // Don't escape links
                if (linkRegExp.test(item)) {
                    this._append(item);
                } else {
                    // Negative lookbehind not supported in Safari so handle escapes separately.
                    this._append(
                        item.replace(MarkdownCharsRegExp, (match: string, offset: number, str: string) => {
                            if (str.charAt(offset - 1) === '\\') {
                                return match;
                            }
                            return '\\' + match;
                        })
                    );
                }
            });
        }

        // Go straight to the builder so that _appendLine doesn't think
        // we're actually trying to insert an extra blank line and skip
        // future whitespace. Empty line deduplication is already handled
        // because Append is used above.
        this._builder += '\n';
    }

    private _preprocessTextLine(line: string): string {
        // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#literal-blocks
        if (LiteralBlockEmptyRegExp.test(line)) {
            return '';
        }

        LiteralBlockReplacements.forEach((item) => (line = line.replace(item.exp, item.replacement)));

        line = line.replace(DoubleTickRegExp, '`');
        return line;
    }

    private _parseEmpty(): void {
        if (_isUndefinedOrWhitespace(this._currentLineOrUndefined())) {
            this._appendLine();
            this._eatLine();
            return;
        }

        this._state = this._parseText;
    }

    private _appendCodeLine(indent = 0, outputIndent = ''): void {
        this._appendLine(outputIndent + this._currentLine().slice(Math.min(this._currentIndent(), indent)));
    }

    private _beginMinIndentCodeBlock(state: State): void {
        this._appendLine('```');
        this._pushAndSetState(state);
        this._blockIndent = this._currentIndent();
    }

    private _beginBacktickBlock(): boolean {
        const match = this._currentLine().match(CodeBlockStartRegExp);
        if (match !== null) {
            this._blockIndent = this._currentIndent();
            this._lastBacktickString = match[1];

            // Remove indentation and preserve language tag.
            this._appendLine(match[1] + match[2]);

            this._pushAndSetState(this._parseBacktickBlock);
            this._eatLine();
            return true;
        }
        return false;
    }

    private _parseBacktickBlock(): void {
        // Only match closing ``` at same indent level of opening.
        if (CodeBlockEndRegExp.test(this._currentLine()) && this._currentIndent() === this._blockIndent) {
            const match = this._currentLine().match(CodeBlockEndRegExp);
            this._lastBacktickString = match ? match[1] : '```';
            this._appendLine(this._lastBacktickString);
            this._appendLine();
            this._popState();
        } else {
            this._appendCodeLine();
        }

        this._eatLine();
    }

    private _beginDocTest(): boolean {
        if (!DoctestRegExp.test(this._currentLine())) {
            return false;
        }

        this._beginMinIndentCodeBlock(this._parseDocTest);
        this._appendCodeLine(this._blockIndent);
        this._eatLine();
        return true;
    }

    private _parseDocTest(): void {
        if (this._currentLineIsOutsideBlock() || _isUndefinedOrWhitespace(this._currentLine())) {
            this._trimOutputAndAppendLine('```');
            this._appendLine();
            this._popState();
            return;
        }

        this._appendCodeLine(this._blockIndent);
        this._eatLine();
    }

    private _beginLiteralBlock(): boolean {
        // The previous line must be empty.
        const prev = this._lineAt(this._lineNum - 1);
        if (prev === undefined) {
            return false;
        } else if (!_isUndefinedOrWhitespace(prev)) {
            return false;
        }

        // Find the previous paragraph and check that it ends with ::
        let i = this._lineNum - 2;
        for (; i >= 0; i--) {
            const line = this._lineAt(i);
            if (_isUndefinedOrWhitespace(line)) {
                continue;
            }

            // Safe to ignore whitespace after the :: because all lines have been trimRight'd.
            if (line!.endsWith('::')) {
                break;
            }

            return false;
        }

        if (i < 0) {
            return false;
        }

        // Special case: allow one-liners at the same indent level.
        if (this._currentIndent() === 0) {
            this._appendLine('```');
            this._pushAndSetState(this._parseLiteralBlockSingleLine);
            return true;
        }

        this._beginMinIndentCodeBlock(this._parseLiteralBlock);
        return true;
    }

    private _parseLiteralBlock(): void {
        // Slightly different than doctest, wait until the first non-empty unindented line to exit.
        if (_isUndefinedOrWhitespace(this._currentLineOrUndefined())) {
            this._appendLine();
            this._eatLine();
            return;
        }

        const prev = this._lineAt(this._lineNum - 1);
        if (this._currentLineIsOutsideBlock() && _isUndefinedOrWhitespace(prev)) {
            this._trimOutputAndAppendLine('```');
            this._appendLine();
            this._popState();
            return;
        }

        this._appendCodeLine();
        this._eatLine();
    }

    private _parseLiteralBlockSingleLine(): void {
        this._appendCodeLine();
        this._appendLine('```');
        this._appendLine();
        this._popState();
        this._eatLine();
    }

    private _beginDirective(): boolean {
        if (!SpaceDotDotRegExp.test(this._currentLine())) {
            return false;
        }

        this._pushAndSetState(this._parseDirective);
        this._blockIndent = this._nextBlockIndent();
        this._appendDirectiveBlock = false;
        return true;
    }

    // https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html#field-lists
    // Python doesn't have a single standard for param documentation. There are four
    // popular styles.
    //
    // 1. Epytext:
    //      @param param1: description
    // 2. reST:
    //      :param param1: description
    // 3. Google (variant 1):
    //      Args:
    //          param1: description
    // 4. Google (variant 2):
    //      Args:
    //          param1 (type): description
    // Called from _parseText after code, directive, and list checks; Google sections take priority over fields.
    private _beginFieldList(): boolean {
        if (this._insideInlineCode) {
            return false;
        }

        if (this._beginGoogleSection()) {
            return true;
        }

        let line = this._currentLine();

        // Handle epyDocs
        if (line.startsWith('@')) {
            this._appendLine();
            this._appendTextLine(line);
            this._lastLineWasPlainText = true;
            this._eatLine();
            return true;
        }

        // catch-all for styles except reST
        const hasArgs = !line?.endsWith(':') && !line?.endsWith('::') && !!line.match(/.*?\s*:\s*(.+)/gu);

        // reSt params. Attempt to put directives lines into their own paragraphs.
        const restDirective = DirectivesExtraNewlineRegExp.test(line); //line.match(/^\s*:param/);

        if (hasArgs || restDirective) {
            const prev = this._lineAt(this._lineNum - 1);
            // Force a line break, if previous line doesn't already have a break or is blank
            if (!this._builder.endsWith(MarkdownLineBreak) && !this._builder.endsWith(`\n\n`) && !_isHeader(prev)) {
                this._builder = this._builder.slice(0, -1) + MarkdownLineBreak;
            }

            // force indent for fields
            line = this._convertIndent(line);
            this._appendTextLine(line);
            this._lastLineWasPlainText = true;
            this._eatLine();
            return true;
        }

        return false;
    }

    private _beginGoogleSection(): boolean {
        if (this._forceLiteral || this._insideInlineCode) {
            return false;
        }

        const line = this._currentLine();
        const trimmed = line.trim();
        if (!trimmed.endsWith(':')) {
            return false;
        }
        const sectionName = trimmed.slice(0, -1).trim();
        if (!Object.prototype.hasOwnProperty.call(GoogleSections, sectionName)) {
            return false;
        }
        const section = GoogleSections[sectionName];

        // "Args:" is also a plain heading. Only claim it when the body is "name: description".
        if (section.ambiguous && !this._nextBodyLineLooksLikeGoogleEntry()) {
            return false;
        }

        this._section = {
            kind: section.kind,
            headerLine: this._lineNum,
            bodyIndent: undefined,
            entryOpen: false,
            codeBlock: undefined,
            continuationIndent: undefined,
        };

        // Start the section header on its own paragraph.
        this._builder = this._builder.replace(/\n*$/, '\n\n');
        this._appendLine('**' + line.trim() + '**');
        this._appendLine();
        this._eatLine();

        this._pushAndSetState(this._parseSection);
        return true;
    }

    private _parseSection(): void {
        const section = this._section;
        if (section === undefined) {
            return;
        }

        if (_isUndefinedOrWhitespace(this._currentLine())) {
            if (section.codeBlock?.kind === 'doctest') {
                this._closeSectionCodeBlock(section);
            }
            if (section.bodyIndent === undefined) {
                this._appendLine();
            } else {
                this._append('\n');
            }
            this._eatLine();
            return;
        }

        if (this._lineEndsSection(section, this._lineNum)) {
            this._finishSection(section);
            return;
        }

        section.bodyIndent ??= this._currentIndent();

        if (section.codeBlock) {
            if (this._currentIndent() >= section.codeBlock.indent) {
                this._appendSectionCodeLine(section);
                this._eatLine();
                return;
            }
            this._closeSectionCodeBlock(section);
        }

        if (this._beginSectionCodeBlock(section)) {
            this._eatLine();
            return;
        }

        this._appendSectionBodyLine(section);
        this._eatLine();
    }

    private _beginSectionCodeBlock(section: SectionState): boolean {
        const line = this._currentLine();
        const match = line.match(CodeBlockStartRegExp);
        const isDoctest = line.trimStart().startsWith('>>>');
        if (!match && !isDoctest) {
            return false;
        }

        const block: CodeBlockState = {
            kind: match ? 'fenced' : 'doctest',
            fence: match ? match[1] : '```',
            indent: this._currentIndent(),
            outputIndent: ' '.repeat(this._getContinuationIndent(section)),
        };
        section.codeBlock = block;
        this._appendLine(block.outputIndent + block.fence + (match ? match[2] : 'python'));
        if (!match) {
            this._appendSectionCodeLine(section);
        }
        return true;
    }

    private _appendSectionCodeLine(section: SectionState): void {
        const block = section.codeBlock;
        if (block === undefined) {
            return;
        }
        if (
            block.kind === 'fenced' &&
            this._currentLine().trim() === block.fence &&
            this._currentIndent() === block.indent
        ) {
            this._appendLine(block.outputIndent + block.fence);
            section.codeBlock = undefined;
            return;
        }
        this._appendCodeLine(block.indent, block.outputIndent);
    }

    private _appendSectionBodyLine(section: SectionState): void {
        const entry =
            section.kind === 'fields' && this._currentIndent() === section.bodyIndent
                ? _parseFieldEntry(this._currentLine().trim())
                : undefined;
        if (entry) {
            section.continuationIndent = undefined;
            section.entryOpen = true;
            this._appendFieldEntry(entry);
        } else {
            this._append(' '.repeat(this._getContinuationIndent(section)));
            this._appendTextLine(this._currentLine().trimStart());
        }
    }

    private _getContinuationIndent(section: SectionState): number {
        if (!section.entryOpen) {
            return Math.max(0, this._currentIndent() - section.bodyIndent!);
        }
        if (this._currentIndent() <= section.bodyIndent!) {
            return 2;
        }
        section.continuationIndent ??= this._currentIndent();
        return 2 + Math.max(0, this._currentIndent() - section.continuationIndent);
    }

    private _nextBodyLineLooksLikeGoogleEntry(): boolean {
        for (let i = this._lineNum + 1; i < this._lines.length; i++) {
            if (!_isUndefinedOrWhitespace(this._lines[i])) {
                return this._isIndentedBlockLine(this._lineNum, i) && !!_parseFieldEntry(this._lines[i].trim());
            }
        }
        return false;
    }

    private _isIndentedBlockLine(headerLine: number, lineIndex: number, allowCollapsedBody = true): boolean {
        return (
            _countLeadingSpaces(this._lines[lineIndex]) > _countLeadingSpaces(this._lines[headerLine]) ||
            (allowCollapsedBody &&
                this._rawIndexes[headerLine] === 0 &&
                this._rawIndents[lineIndex] > this._rawIndents[headerLine])
        );
    }

    private _lineEndsSection(section: SectionState, lineIndex: number): boolean {
        // Cleaning can collapse a first-physical-line header onto its body's indent.
        const allowCollapsedBody =
            section.bodyIndent === undefined ||
            section.bodyIndent <= _countLeadingSpaces(this._lines[section.headerLine]);
        return !this._isIndentedBlockLine(section.headerLine, lineIndex, allowCollapsedBody);
    }

    private _finishSection(section: SectionState): void {
        this._closeSectionCodeBlock(section);
        this._section = undefined;
        this._popState();
    }

    private _closeSectionCodeBlock(section: SectionState): void {
        if (!section.codeBlock) {
            return;
        }

        this._trimOutputAndAppendLine(section.codeBlock.outputIndent + section.codeBlock.fence);
        section.codeBlock = undefined;
    }

    private _appendFieldEntry(entry: FieldEntry): void {
        this._append(`* \`${entry.name}\``);
        if (entry.type) {
            this._append(` (\`${entry.type}\`${entry.qualifier ? `, ${entry.qualifier}` : ''})`);
        }
        this._append(': ');
        if (entry.description) {
            this._appendTextLine(entry.description);
        } else {
            this._builder += '\n';
        }
    }

    private _beginTableBlock(): boolean {
        if (this._insideInlineCode) {
            return false;
        }

        const line = this._currentLine();

        if (EqualHeaderRegExp.test(line)) {
            this._tableState = { header: line.trimStart(), inHeader: true };
            this._eatLine();
            this._pushAndSetState(this._parseTableBlock);
            return true;
        }

        return false;
    }

    // Converts ReST style tables to ones that vscode will render.
    //
    //    ReST:
    //    ========= ============
    //    Syntax    Description
    //    --------- ------------
    //    Header    Title
    //    Paragraph Text
    //    ========= ============
    //
    //    Markdown:
    //    | Syntax      | Description |
    //    | ----------- | ----------- |
    //    | Header      | Title       |
    //    | Paragraph   | Text        |
    private _parseTableBlock(): void {
        if (_isUndefinedOrWhitespace(this._currentLineOrUndefined()) || !this._tableState) {
            this._tableState = undefined;
            this._popState();
            return;
        }

        let line = this._currentLine();

        if (EqualHeaderRegExp.test(line)) {
            this._eatLine();
            this._appendLine('\n<br/>\n');
            this._popState();
            this._tableState = undefined;
            return;
        } else {
            let formattedLine = '|';
            const columnParts = this._tableState.header.split(' ');
            const headerStrings: string[] = [];

            if (this._tableState.inHeader) {
                do {
                    // Special header parsing to handle multiline headers
                    // for now we just append the multi header rows into a single line
                    // using the html <br> to signify newlines, but vscode doesn't seem to support it yet
                    // So headers will appear as a single line for now
                    let colStart = 0;
                    for (let i = 0; i < columnParts.length; i++) {
                        const equalStr = columnParts[i];
                        const len = equalStr.length + 1;
                        const columnStr = line.slice(colStart, colStart + len);

                        if (headerStrings[i] === undefined) {
                            headerStrings[i] = `${columnStr} `;
                        } else {
                            headerStrings[i] = headerStrings[i].concat(`<br>${columnStr} `);
                        }
                        colStart += len;
                    }
                    this._eatLine();
                    line = this._currentLine();
                } while (
                    !_isUndefinedOrWhitespace(this._currentLineOrUndefined()) &&
                    !DashHeaderRegExp.test(line) &&
                    !EqualHeaderRegExp.test(line)
                );

                this._tableState.inHeader = false;

                // Append header
                headerStrings.forEach((h) => {
                    formattedLine += `${h}|`;
                });
                this._appendLine(formattedLine);

                // Convert header end
                const endHeaderStr = line.trimStart().replace(/=/g, '-').replace(' ', '|');
                this._appendLine(`|${endHeaderStr}|`);
                this._eatLine();
            } else {
                // Normal row parsing
                let colStart = 0;
                columnParts.forEach((column) => {
                    const len = column.length + 1;
                    const columnStr = line.slice(colStart, colStart + len);
                    formattedLine += `${columnStr}|`;

                    colStart += len;
                });

                this._appendLine(formattedLine);
                this._eatLine();
            }
        }
    }

    private _beginList(): boolean {
        if (this._insideInlineCode) {
            return false;
        }

        let line = this._currentLine();
        const dashMatch = LeadingDashListRegExp.exec(line);
        if (dashMatch?.length === 2) {
            // Prevent list item from being see as code, by halving leading spaces
            if (dashMatch[1].length >= 4) {
                line = ' '.repeat(dashMatch[1].length / 2) + line.trimLeft();
            }

            this._appendTextLine(line);
            this._eatLine();

            if (this._state !== this._parseList) {
                this._pushAndSetState(this._parseList);
            }
            return true;
        }

        const asteriskMatch = LeadingAsteriskListRegExp.exec(line);
        if (asteriskMatch?.length === 2) {
            if (asteriskMatch[1].length === 0) {
                line = line = ' ' + line;
            } else if (asteriskMatch[1].length >= 4) {
                // Prevent list item from being see as code, by halving leading spaces
                line = ' '.repeat(asteriskMatch[1].length / 2) + line.trimLeft();
            }

            this._appendTextLine(line);
            this._eatLine();
            if (this._state !== this._parseList) {
                this._pushAndSetState(this._parseList);
            }
            return true;
        }

        const leadingNumberList = LeadingNumberListRegExp.exec(line);
        if (leadingNumberList?.length === 2) {
            this._appendTextLine(line);
            this._eatLine();
            return true;
        }

        return false;
    }

    private _parseList(): void {
        if (_isUndefinedOrWhitespace(this._currentLineOrUndefined()) || this._currentLineIsOutsideBlock()) {
            this._popState();
            return;
        }

        // Check for the start of a new list item
        const isMultiLineItem = !this._beginList();

        // Remove leading spaces so that multiline items get appear in a single block
        if (isMultiLineItem) {
            const line = this._currentLine().trimStart();
            this._appendTextLine(line);
            this._eatLine();
        }
    }

    private _parseDirective(): void {
        // http://docutils.sourceforge.net/docs/ref/rst/restructuredtext.html#directives

        const match = DirectiveLikeRegExp.exec(this._currentLine());
        if (match !== null && match.length === 3) {
            const directiveType = match[1];
            const directive = match[2];

            if (directiveType === 'class') {
                this._appendDirectiveBlock = true;
                this._appendLine();
                this._appendLine('```');
                this._appendLine(directive);
                this._appendLine('```');
                this._appendLine();
            } else if (directiveType === 'code-block') {
                this._appendDirectiveBlock = true;
                this._beginMinIndentCodeBlock(this._parseLiteralBlock);
                this._eatLine();
                return;
            }
        }

        if (this._blockIndent === 0) {
            // This is a one-liner directive, so pop back.
            this._popState();
        } else {
            this._state = this._parseDirectiveBlock;
        }

        this._eatLine();
    }

    private _parseDirectiveBlock(): void {
        if (!_isUndefinedOrWhitespace(this._currentLineOrUndefined()) && this._currentLineIsOutsideBlock()) {
            this._popState();
            return;
        }

        if (this._appendDirectiveBlock) {
            // This is a bit of a hack. This just trims the text and appends it
            // like top-level text, rather than doing actual indent-based recursion.
            this._appendTextLine(this._currentLine().trimLeft());
        }

        this._eatLine();
    }

    private _appendLine(line?: string): void {
        this._lastLineWasPlainText = false;

        if (!_isUndefinedOrWhitespace(line)) {
            this._builder += line + '\n';
            this._skipAppendEmptyLine = false;
        } else if (!this._skipAppendEmptyLine) {
            this._builder += '\n';
            this._skipAppendEmptyLine = true;
        }
    }

    private _append(text: string): void {
        this._builder += text;
        this._skipAppendEmptyLine = false;
    }

    private _trimOutputAndAppendLine(line: string, noNewLine = false): void {
        this._builder = this._builder.trimRight();
        this._skipAppendEmptyLine = false;

        if (!noNewLine) {
            this._appendLine();
        }

        this._appendLine(line);
    }
}

function _countLeadingSpaces(s: string): number {
    return s.search(LeadingSpaceCountRegExp);
}

function _isUndefinedOrWhitespace(s: string | undefined): boolean {
    return s === undefined || !NonWhitespaceRegExp.test(s);
}

function _isHeader(line: string | undefined): boolean {
    return line !== undefined && (line.match(/^\s*[#`~=-]{3,}/)?.length ?? 0) > 0;
}

function _parseFieldEntry(line: string): FieldEntry | undefined {
    const parts = _splitTopLevel(line, ':');
    if (!parts || !parts[0].trim()) {
        return undefined;
    }

    const head = parts[0].trim();
    const annotation = head.match(/^(.*?)\s*\(([^()]*)\)$/);
    const name = annotation ? annotation[1] : head;
    if (
        line.startsWith('- ') ||
        line.startsWith('* ') ||
        !name
            .replace(/^\*{1,2}/, '')
            .split('.')
            .every(_isParameterNamePart)
    ) {
        return undefined;
    }

    const entry: FieldEntry = { name, description: parts[1].trim() };
    if (annotation) {
        const typeParts = _splitTopLevel(annotation[2], ',');
        entry.type = (typeParts ? typeParts[0] : annotation[2]).trim();
        entry.qualifier = typeParts?.[1].trim();
    }
    return entry;
}

function _isParameterNamePart(name: string): boolean {
    if (!name) {
        return false;
    }

    let first = true;
    for (const character of name) {
        const char = character.charCodeAt(0);
        const nextChar = character.length === 2 ? character.charCodeAt(1) : undefined;
        if (!(first ? isIdentifierStartChar(char, nextChar) : isIdentifierChar(char, nextChar))) {
            return false;
        }
        first = false;
    }
    return true;
}

function _findTopLevelSeparator(text: string, separator: string): number | undefined {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '[' || char === '(' || char === '{') {
            depth++;
        } else if (char === ']' || char === ')' || char === '}') {
            depth--;
        } else if (char === separator && depth === 0) {
            return i;
        }
    }
    return undefined;
}

function _splitTopLevel(text: string, separator: string): [string, string] | undefined {
    const offset = _findTopLevelSeparator(text, separator);
    return offset === undefined ? undefined : [text.slice(0, offset), text.slice(offset + 1)];
}
