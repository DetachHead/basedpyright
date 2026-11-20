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

const docStringCrRegEx = /\r/g;
const docStringTabRegEx = /\t/g;

export function cleanAndSplitDocString(rawString: string): string[] {
    // Remove carriage returns and replace tabs.
    const unescaped = rawString.replace(docStringCrRegEx, '').replace(docStringTabRegEx, '        ');

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

export function extractAttributeDocumentation(classDocString: string, attrName: string): string | undefined {
    if (!classDocString || !attrName) {
        return undefined;
    }

    // Python documentation styles for attributes:
    //
    // 1. reST:
    //      :ivar attr1: description
    // 2. Google:
    //      Attributes:
    //          attr1: description
    // 3. Google (with type):
    //      Attributes:
    //          attr1 (type): description

    const docStringLines = cleanAndSplitDocString(classDocString);
    for (const line of docStringLines) {
        const trimmedLine = line.trim();

        // Check for reST format
        let attrOffset = trimmedLine.indexOf(':ivar ' + attrName);
        if (attrOffset >= 0) {
            return trimmedLine.substr(attrOffset + 6);
        }

        // Check for Google (variant 1) format
        attrOffset = trimmedLine.indexOf(attrName + ': ');
        if (attrOffset >= 0) {
            return trimmedLine.substr(attrOffset);
        }

        // Check for Google (variant 2) format
        attrOffset = trimmedLine.indexOf(attrName + ' (');
        if (attrOffset >= 0) {
            return trimmedLine.substr(attrOffset);
        }
    }

    return undefined;
}

export function extractReturnDocumentation(functionDocString: string): string | undefined {
    if (!functionDocString) {
        return undefined;
    }

    // Python doesn't have a single standard for documenting return values. There are three
    // popular styles.
    //
    // 1. Epytext:
    //      @return: description
    //      @returns: description
    // 2. reST:
    //      :return: description
    //      :returns: description
    // 3. Google:
    //      Returns:
    //          description
    //      Returns:
    //          type: description

    // Scan the raw (only CR/tab-normalized) lines rather than cleanAndSplitDocString output.
    // cleanAndSplitDocString trims the first physical line to indent 0 and dedents the rest by a
    // common indent, which can collapse a first-line "Returns:" header and its body to the same
    // indent (e.g. `"""Returns:\n    the value."""`). The Google branch below compares header vs
    // body indentation, so it needs the original indentation preserved. reST/Epytext matching is
    // indent-agnostic and is unaffected by using raw lines.
    const docStringLines = functionDocString
        .replace(docStringCrRegEx, '')
        .replace(docStringTabRegEx, '        ')
        .split('\n');
    for (let i = 0; i < docStringLines.length; i++) {
        const line = docStringLines[i];
        const trimmedLine = line.trim();

        // Check for reST format (":return:" / ":returns:").
        let match = trimmedLine.match(/^:returns?:\s*(.*)$/i);
        if (match) {
            const description = match[1].trim();
            return description.length > 0 ? description : undefined;
        }

        // Check for Epytext format ("@return:" / "@returns:"). Mirror the reST handling so a
        // missing space after the colon (e.g. "@returns:foo") still extracts the description. The
        // word boundary keeps "@returnsfoo" (no delimiter) from being treated as a return field.
        match = trimmedLine.match(/^@returns?\b:?\s*(.*)$/i);
        if (match) {
            const description = match[1].trim();
            return description.length > 0 ? description : undefined;
        }

        // Check for Google format ("Returns:" / "Return:" section header). The description
        // lives on the following line(s), indented deeper than the header.
        //
        // Note: this matches the first "Returns:" line anywhere in the docstring; it does not
        // require the header to be at the outermost section indent. A bare "Returns:" nested
        // inside another section would therefore be treated as the header. That matches the
        // existing Args/parameter extraction behavior and is acceptable in practice.
        if (/^returns?:$/i.test(trimmedLine)) {
            const headerIndent = line.length - line.trimStart().length;
            const descriptionLines: string[] = [];
            for (let j = i + 1; j < docStringLines.length; j++) {
                const nextLine = docStringLines[j];
                if (nextLine.trim().length === 0) {
                    // A blank line ends the section once we've started collecting.
                    if (descriptionLines.length > 0) {
                        break;
                    }
                    continue;
                }

                const nextIndent = nextLine.length - nextLine.trimStart().length;
                if (nextIndent <= headerIndent) {
                    // Dedented back to (or past) the header: next section started.
                    break;
                }

                descriptionLines.push(nextLine.trim());
            }

            const description = descriptionLines.join('\n').trim();
            return description.length > 0 ? description : undefined;
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
