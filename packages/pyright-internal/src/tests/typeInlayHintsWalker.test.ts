import { tExpect } from 'typed-jest-expect';
import { ImportTrackerResults } from '../analyzer/typePrinter';
import { inlayHintSampleFile } from './testUtils';

const noImports: ImportTrackerResults = { imports: new Set(), importFroms: new Map() };

//TODO: these tests have different start positions in ci on windows, i assume because of crlf moment
if (process.platform !== 'win32' || !process.env['CI']) {
    test('variables', () => {
        const result = inlayHintSampleFile('variables.py');
        tExpect(result).toStrictEqual([
            {
                inlayHintType: 'variable',
                position: 158,
                value: ': str',
                imports: noImports,
            },
            {
                inlayHintType: 'variable',
                position: 464,
                value: ': TypeAlias',
                imports: { importFroms: new Map([['typing', new Set(['TypeAlias'])]]), imports: new Set() },
            },
            {
                inlayHintType: 'variable',
                position: 684,
                value: ': Foo',
                imports: noImports,
            },
            {
                inlayHintType: 'variable',
                position: 709,
                value: ': type[int]',
                imports: noImports,
            },
            {
                inlayHintType: 'variable',
                position: 760,
                value: ': int | str',
                imports: noImports,
            },
            {
                inlayHintType: 'variable',
                position: 785,
                value: ': Literal[1, 2]',
                imports: { importFroms: new Map([['typing', new Set(['Literal'])]]), imports: new Set() },
            },
            {
                inlayHintType: 'variable',
                position: 811,
                value: ': type[int]',
                imports: noImports,
            },
            {
                inlayHintType: 'variable',
                position: 864,
                value: ': Iterable[Path] | Awaitable[int]',
                imports: {
                    importFroms: new Map([
                        ['typing', new Set(['Iterable', 'Awaitable'])],
                        ['pathlib', new Set(['Path'])],
                    ]),
                    imports: new Set(),
                },
            },
            {
                inlayHintType: 'variable',
                position: 879,
                value: ': Callable[[], Path]',
                imports: {
                    importFroms: new Map([
                        ['typing', new Set(['Callable'])],
                        ['pathlib', new Set(['Path'])],
                    ]),
                    imports: new Set(),
                },
            },
            {
                inlayHintType: 'variable',
                position: 1008,
                value: ': list[Any]',
                imports: {
                    importFroms: new Map([['typing', new Set(['Any'])]]),
                    imports: new Set(),
                },
            },
        ]);
    });

    test('function defs', () => {
        const result = inlayHintSampleFile('function_defs.py');
        tExpect(result).toStrictEqual([
            { inlayHintType: 'functionReturn', position: 38, value: '-> None', imports: noImports },
            {
                inlayHintType: 'functionReturn',
                position: 88,
                value: "-> Literal['']",
                imports: { importFroms: new Map([['typing', new Set(['Literal'])]]), imports: new Set() },
            },
        ]);
    });

    test('function calls', () => {
        const result = inlayHintSampleFile('function_calls.py');
        tExpect(result).toStrictEqual([
            { inlayHintType: 'parameter', position: 99, value: 'value=' },
            { inlayHintType: 'parameter', position: 175, value: 'value=' },
            { inlayHintType: 'parameter', position: 178, value: 'bar=' },
            { inlayHintType: 'parameter', position: 219, value: 'bar=' },
            { inlayHintType: 'parameter', position: 460, value: 'a=' },
            { inlayHintType: 'parameter', position: 488, value: 'b=' },
            { inlayHintType: 'parameter', position: 711, value: 'b=' },
        ]);
    });

    test('function calls param matching', () => {
        const result = inlayHintSampleFile('function_calls.py', undefined, { callArgumentNamesMatching: true });
        tExpect(result).toStrictEqual([
            { inlayHintType: 'parameter', position: 99, value: 'value=' },
            { inlayHintType: 'parameter', position: 175, value: 'value=' },
            { inlayHintType: 'parameter', position: 178, value: 'bar=' },
            { inlayHintType: 'parameter', position: 212, value: 'value=' }, // this one is unique to callArgumentNamesMatching: true
            { inlayHintType: 'parameter', position: 219, value: 'bar=' },
            { inlayHintType: 'parameter', position: 460, value: 'a=' },
            { inlayHintType: 'parameter', position: 488, value: 'b=' },
            { inlayHintType: 'parameter', position: 711, value: 'b=' },
        ]);
    });

    test('method calls', () => {
        const result = inlayHintSampleFile('method_calls.py', undefined);
        // With callArgumentNamesMatching false, member accesses ending in .foo should NOT show hint
        // bar(3) shows hint, bar(self.foo) doesn't, bar(baz.quz.qux.foo) doesn't
        tExpect(result).toStrictEqual([{ inlayHintType: 'parameter', position: 101, value: 'foo=' }]);
    });

    test('method calls param matching', () => {
        const result = inlayHintSampleFile('method_calls.py', undefined, { callArgumentNamesMatching: true });
        // With callArgumentNamesMatching true, all three calls should show hints
        tExpect(result).toStrictEqual([
            { inlayHintType: 'parameter', position: 101, value: 'foo=' },
            { inlayHintType: 'parameter', position: 116, value: 'foo=' }, // this one is unique to callArgumentNamesMatching: true
            { inlayHintType: 'parameter', position: 138, value: 'foo=' }, // this one is unique to callArgumentNamesMatching: true
        ]);
    });

    test('range', () => {
        const result = inlayHintSampleFile('variables.py', {
            start: { line: 0, character: 0 },
            end: { line: 5, character: 0 },
        });
        tExpect(result).toStrictEqual([
            {
                inlayHintType: 'variable',
                position: 158,
                value: ': str',
                imports: noImports,
            },
        ]);
    });
    test('generics', () => {
        const result = inlayHintSampleFile('generics.py', undefined, { genericTypes: true });
        tExpect(result).toStrictEqual([
            {
                inlayHintType: 'generic',
                position: 65,
                value: '[int]',
                imports: noImports,
            },
            {
                inlayHintType: 'generic',
                position: 136,
                value: '[str]',
                imports: noImports,
            },
            {
                inlayHintType: 'generic',
                position: 185,
                value: '[int]',
                imports: noImports,
            },
            {
                inlayHintType: 'generic',
                position: 315,
                value: '[bool]',
                imports: noImports,
            },
            {
                inlayHintType: 'parameter',
                position: 316,
                value: 'value=',
            },
            {
                inlayHintType: 'generic',
                position: 332,
                value: '[Literal[1, 2, 3], ...]',
                imports: { importFroms: new Map([['typing', new Set(['Literal'])]]), imports: new Set() },
            },
            {
                inlayHintType: 'generic',
                position: 441,
                value: '[list[int], int, int, str]',
                imports: noImports,
            },
            {
                inlayHintType: 'parameter',
                position: 442,
                value: 'asdf=',
            },
            {
                inlayHintType: 'generic',
                position: 581,
                value: '[tuple[int, str]]',
                imports: noImports,
            },
        ]);
    });
    test('conflicting names', () => {
        const result = inlayHintSampleFile('conflicting_names/b.py', undefined, { genericTypes: true });
        tExpect(result).toStrictEqual([
            {
                inlayHintType: 'variable',
                position: 40,
                value: ': tuple[conflicting_names.a.Foo, Foo]',
                imports: { importFroms: new Map(), imports: new Set(['conflicting_names.a']) },
            },
        ]);
    });
} else {
    // prevent jest from failing because no tests were found
    test('windows placeholder', () => {});
}
