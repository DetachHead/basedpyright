/*
 * Copyright (c) BasedSoft Corporation.
 * Licensed under the MIT license.
 * Author: KotlinIsland
 *
 * Unit tests for pydantic support.
 */

import * as TestUtils from './testUtils';
import { DiagnosticRule } from '../common/diagnosticRules';

test('aliases', () => {
    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['pydanticAlias.py']);
    TestUtils.validateResultsButBased(analysisResults, {
        errors: [
            {
                code: DiagnosticRule.reportCallIssue,
                line: 18,
                message: 'Arguments missing for parameters "b1", "b2", "b3"',
            },
            { code: DiagnosticRule.reportCallIssue, line: 19, message: 'No parameter named "a1"' },
            { code: DiagnosticRule.reportCallIssue, line: 20, message: 'No parameter named "a2"' },
            { code: DiagnosticRule.reportCallIssue, line: 21, message: 'No parameter named "a3"' },
            { code: DiagnosticRule.reportCallIssue, line: 22, message: 'No parameter named "z"' },
            {
                code: DiagnosticRule.reportAttributeAccessIssue,
                line: 38,
                message: 'Cannot access attribute "b1" for class "M"\n\u00A0\u00A0Attribute "b1" is unknown',
            },
            {
                code: DiagnosticRule.reportAttributeAccessIssue,
                line: 39,
                message: 'Cannot access attribute "b2" for class "M"\n\u00A0\u00A0Attribute "b2" is unknown',
            },
            {
                code: DiagnosticRule.reportAttributeAccessIssue,
                line: 40,
                message: 'Cannot access attribute "b3" for class "M"\n\u00A0\u00A0Attribute "b3" is unknown',
            },
            {
                code: DiagnosticRule.reportAttributeAccessIssue,
                line: 41,
                message: 'Cannot access attribute "z" for class "M"\n\u00A0\u00A0Attribute "z" is unknown',
            },
        ],
    });
});

test('other features', () => {
    const analysisResults = TestUtils.typeAnalyzeSampleFiles(['pydanticFeatures.py']);
    TestUtils.validateResultsButBased(analysisResults, {
        errors: [{ code: DiagnosticRule.reportCallIssue, line: 21, message: 'No parameter named "z"' }],
    });
});
