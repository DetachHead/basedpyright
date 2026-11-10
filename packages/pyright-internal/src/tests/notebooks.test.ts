import { tExpect } from 'typed-jest-expect';
import { ConfigOptions } from '../common/configOptions';
import { DiagnosticRule } from '../common/diagnosticRules';
import { Uri } from '../common/uri/uri';
import { ErrorTrackingNullConsole, typeAnalyzeSampleFiles, validateResultsButBased } from './testUtils';

test('symbol from previous cell', () => {
    const analysisResults = typeAnalyzeSampleFiles(['notebook.ipynb']);
    tExpect(analysisResults.length).toStrictEqual(3);
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
    validateResultsButBased(analysisResults[2], {
        errors: [],
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

test('unused call result at end of notebook cell', () => {
    const configOptions = new ConfigOptions(Uri.empty());
    configOptions.diagnosticRuleSet.reportUnusedCallResult = 'error';

    const analysisResults = typeAnalyzeSampleFiles(['notebookUnusedCallResult.ipynb'], configOptions);
    tExpect(analysisResults.length).toStrictEqual(3);
    validateResultsButBased(analysisResults[0], {
        errors: [],
    });
    validateResultsButBased(analysisResults[1], {
        errors: [{ code: DiagnosticRule.reportUnusedCallResult, line: 0 }],
    });
    validateResultsButBased(analysisResults[2], {
        errors: [{ code: DiagnosticRule.reportUnusedCoroutine, line: 3 }],
    });
});
