/*
 * docStringUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Static methods that format and parse doc strings based on
 * the rules specified in PEP 257
 * (https://www.python.org/dev/peps/pep-0257/).
 */

export function cleanAndSplitDocString(rawString: string): string[] {
    // Remove carriage returns and replace tabs.
    const unescaped = rawString.replace(/\r/g, '').replace(/\t/g, '        ');

    // Split into lines.
    const lines = unescaped.split('\n');

    // Determine the max indent amount.
    let leftSpacesToRemove = Number.MAX_VALUE;
    lines.forEach((line, index) => {
        // First line is special.
        if (lines.length <= 1 || index > 0) {
            const trimmed = line.trimStart();
            if (trimmed) {
                leftSpacesToRemove = Math.min(leftSpacesToRemove, line.length - trimmed.length);
            }
        }
    });

    // Handle the case where there were only empty lines.
    if (leftSpacesToRemove >= Number.MAX_VALUE) {
        leftSpacesToRemove = 0;
    }

    // Trim the lines.
    const trimmedLines: string[] = [];
    lines.forEach((line, index) => {
        if (index === 0) {
            trimmedLines.push(line.trim());
        } else {
            trimmedLines.push(line.slice(leftSpacesToRemove).trimEnd());
        }
    });

    // Strip off leading and trailing blank lines.
    while (trimmedLines.length > 0 && trimmedLines[0].length === 0) {
        trimmedLines.shift();
    }

    while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].length === 0) {
        trimmedLines.pop();
    }

    return trimmedLines;
}

/**
 * Extract information about the given parameter from a docstring in one of the following formats:
 *
 * Epytext
 * ```python
 * def func(param1, param2):
 *     """
 *     @param param1: description
 *     @type param1: str (we don't parse this)
 *     @param param2: multi-line description first line
 *         multi-line description second line
 *     returns: None (we don't parse this)
 *     """
 *     pass
 * ```
 *
 *
 * reST
 * ```python
 * def func(param1, param2):
 *     """
 *     :param param1: description
 *     :param param2: multi-line description first line
 *         multi-line description second line
 *     """
 *     pass
 * ```
 *
 * Google, variant 1
 * ```python
 * def func(param1, param2):
 *     """
 *     Description of function (we don't parse this)
 *
 *     Args:
 *         param1: multi-line description first line
 *             multi-line description second line
 *
 *     Returns:
 *         Optional description of return type (we don't parse this)
 *
 *     Raises:
 *         Optional description of potential errors raised (we don't parse this)
 *     """
 *     pass
 * ```
 *
 * Google, variant 2
 * ```python
 * def func(param1, param2):
 *     """
 *     Description of function (we don't parse this)
 *
 *     Args:
 *         param1 (type): multi-line description first line
 *             multi-line description second line
 *
 *     Returns:
 *         Optional description of return type (we don't parse this)
 *
 *     Raises:
 *         Optional description of potential errors raised (we don't parse this)
 *     """
 *     pass
 * ```
 */
export function extractParameterDocumentation(functionDocString: string, paramName: string): string | undefined {
    if (!functionDocString || !paramName) {
        return undefined;
    }

    const docStringLines = cleanAndSplitDocString(functionDocString);
    const docstringTypes = [
        { marker: `@param ${paramName}`, trim: 7 },
        { marker: `:param ${paramName}:`, trim: 7 },
        { marker: `${paramName}:`, trim: 0 },
        { marker: `${paramName} (`, trim: 0 },
    ];

    // Iterate over each line and check if it matches one of the above markers.
    for (const [idx, line] of docStringLines.entries()) {
        let result = undefined;
        let paramOffset = -1;

        for (const typ of docstringTypes) {
            // If we get a match, process the remaining lines of the docstring to check for multi-line parameter descriptions.
            paramOffset = line.indexOf(typ.marker);
            if (paramOffset >= 0) {
                result = parseParameterDescription(paramOffset, typ.trim, docStringLines.slice(idx));
                if (result) {
                    return result;
                }
            }
        }
    }

    return undefined;
}

/**
 * Iterate over the remainder of the docstring lines and look for multi-line parameter descriptions.
 *
 * By the time we're in this function, we know that the first entry in the given slice
 * contains a match for the parameter of interest. We process that, and then check if subsequent
 * lines are a continuation of the description on the first line. If so, we concatenate them
 * and return the full parameter description
 */
function parseParameterDescription(paramOffset: number, trim: number, docStringLines: string[]): string | undefined {
    let result = undefined;
    for (const line of docStringLines) {
        // we know the first entry is the first line of the param description
        if (result === undefined) {
            result = line.slice(paramOffset + trim).trimEnd();
        } else {
            const initialSpaces = line.match(/(^ +)\S/);
            if (initialSpaces) {
                // description continuation should have more leading spaces than the
                // first line of the description
                if (initialSpaces[1].length > paramOffset) {
                    if (!result.endsWith('\n')) {
                        result += ' ';
                    }
                    result += line.trim();
                } else {
                    return result;
                }
            } else if (line.length !== 0) {
                // if the line doesn't start with spaces and isn't empty, it's not a continuation of this param's description
                return result;
            } else {
                result += '\n';
            }
        }
    }
    return result;
}
