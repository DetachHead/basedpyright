import { tExpect } from 'typed-jest-expect';
import { DiagnosticRule } from '../common/diagnosticRules';
import { ErrorTrackingNullConsole, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

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

test('invalid notebook file', () => {
    const console = new ErrorTrackingNullConsole();
    typeAnalyzeSampleFiles(['notebook3.ipynb'], undefined, console);
    tExpect(console.errors.length).toStrictEqual(1);
    tExpect(console.errors[0]).toMatch(
        // .* at the end because the error message is slightly different on windows and linux
        /failed to parse jupyter notebook .* - SyntaxError: Unexpected token .*/
    );
});

test('IPython.display.display automatically imported', () => {
    const analysisResults = typeAnalyzeSampleFiles(['ipython_display_import/notebook.ipynb']);
    validateResultsButBased(analysisResults, {
        errors: [{ code: DiagnosticRule.reportUndefinedVariable, line: 4 }],
    });
});
