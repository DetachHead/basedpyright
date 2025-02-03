import { tExpect } from 'typed-jest-expect';
import { DiagnosticRule } from '../common/diagnosticRules';
import { typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('symbol from previous cell', () => {
    const analysisResults = typeAnalyzeSampleFiles(['notebook.ipynb']);
    tExpect(analysisResults.length).toStrictEqual(2);
    validateResultsButBased(analysisResults[0], {
        errors: [],
    });
    validateResultsButBased(analysisResults[1], {
        errors: [
            {
                code: DiagnosticRule.reportAssignmentType,
                line: 0,
                //TODO: get rid of these stupid fake spaces
                message: 'Type "int" is not assignable to declared type "str"\n  "int" is not assignable to "str"',
            },
        ],
    });
});

test('non-python cell', () => {
    const analysisResults = typeAnalyzeSampleFiles(['notebook2.ipynb']);
    tExpect(analysisResults.length).toStrictEqual(0);
});
