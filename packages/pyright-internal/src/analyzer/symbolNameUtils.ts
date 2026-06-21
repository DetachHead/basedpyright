/*
 * symbolNameUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Static methods that apply to symbols or symbol names.
 */

const _constantRegEx = /^[A-Z0-9_]+$/;
const _underscoreOnlyRegEx = /^[_]+$/;
const _camelCaseRegEx = /^_{0,2}[A-Z][A-Za-z0-9_]+$/;
const _asciiNameRegEx = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Private symbol names start with a double underscore.
export function isPrivateName(name: string) {
    return name.length > 2 && name.startsWith('__') && !name.endsWith('__');
}

// Protected symbol names start with a single underscore.
export function isProtectedName(name: string) {
    return name.length > 1 && name.startsWith('_') && !name.startsWith('__');
}

export function isPrivateOrProtectedName(name: string) {
    return isPrivateName(name) || isProtectedName(name);
}

// "Dunder" names start and end with two underscores.
export function isDunderName(name: string) {
    return name.length > 4 && name.startsWith('__') && name.endsWith('__');
}

// "Single Dunder" names start and end with single underscores.
export function isSingleDunderName(name: string) {
    return name.length > 2 && name.startsWith('_') && name.endsWith('_');
}

/** underscore-only names mean a value is being intentionally ignored */
export const isUnderscoreOnlyName = (name: string) => name.match(_underscoreOnlyRegEx);

// Constants are all-caps with possible numbers and underscores.
export function isConstantName(name: string) {
    return !!name.match(_constantRegEx) && !isUnderscoreOnlyName(name);
}

// Type aliases are CamelCase with possible numbers and underscores.
export function isTypeAliasName(name: string) {
    return !!name.match(_camelCaseRegEx);
}

export function isPublicConstantOrTypeAlias(name: string) {
    return !isPrivateOrProtectedName(name) && (isConstantName(name) || isTypeAliasName(name));
}

export function isLegalModulePartName(name: string): boolean {
    // PEP8 indicates that all module names should be lowercase
    // with underscores. It doesn't talk about non-ASCII
    // characters, but it appears that's the convention.
    return !!name.match(/[a-z_]+/);
}

export function isFileSystemForbiddenName(name: string) {
    for (const ch of name) {
        const code = ch.charCodeAt(0);
        if (code < 0x20 || code === 0x7f) {
            return true;
        }
        if (
            ch === '<' ||
            ch === '>' ||
            ch === ':' ||
            ch === '"' ||
            ch === '/' ||
            ch === '\\' ||
            ch === '|' ||
            ch === '?' ||
            ch === '*'
        ) {
            return true;
        }
    }
    return false;
}

export function isUnicodeName(name: string) {
    for (const ch of name) {
        if (ch.charCodeAt(0) > 127) {
            return true;
        }
    }
    return false;
}

export type NameValidation = 'ok' | 'forbidden' | 'nonIdentifier' | 'dot' | 'unicode';

export function validateArbitaryModuleNamePart(name: string): NameValidation {
    if (!name || isFileSystemForbiddenName(name)) {
        return 'forbidden';
    }
    // Pure-ASCII Python identifier
    if (_asciiNameRegEx.test(name)) {
        return 'ok';
    }
    // Dot: always conflicts with Python's package-path resolution.
    // A file named `foo.bar.py` can never be imported — `import foo.bar`
    // looks for `foo/bar.py`, not `foo.bar.py`.
    if (name.includes('.')) {
        return 'dot';
    }
    // Non-ASCII: could be valid PEP 3131 identifier, but warn about portability
    if (isUnicodeName(name)) {
        return 'unicode';
    }
    return 'nonIdentifier';
}
