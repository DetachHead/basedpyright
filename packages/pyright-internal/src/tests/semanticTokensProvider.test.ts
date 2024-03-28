import { semanticTokenizeSampleFile } from './testUtils';

//TODO: these tests have different start positions in ci on windows, i assume because of crlf moment
if (process.platform !== 'win32' || !process.env['CI']) {
    test('variable', () => {
        const result = semanticTokenizeSampleFile('variable.py');
        expect(result).toStrictEqual([{ type: 'variable', length: 1, start: 0, modifiers: [] }]);
    });

    test('type annotation', () => {
        const result = semanticTokenizeSampleFile('type_annotation.py');
        expect(result).toStrictEqual([
            { type: 'variable', modifiers: [], start: 0, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 3, length: 3 },
            { type: 'variable', modifiers: [], start: 7, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 10, length: 3 },
        ]);
    });

    test('imports', () => {
        const result = semanticTokenizeSampleFile('imports.py');
        expect(result).toStrictEqual([
            //TODO: fix duplicates
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'class', modifiers: [], start: 26, length: 8 },
            { type: 'class', modifiers: [], start: 38, length: 3 },
            { type: 'namespace', modifiers: [], start: 47, length: 11 },
            { type: 'namespace', modifiers: [], start: 59, length: 3 },
            { type: 'class', modifiers: [], start: 70, length: 8 },
            { type: 'class', modifiers: [], start: 70, length: 8 },
        ]);
    });

    test('final', () => {
        const result = semanticTokenizeSampleFile('final.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'variable', modifiers: ['readonly'], start: 26, length: 3 },
            { type: 'variable', modifiers: ['readonly'], start: 34, length: 3 },
            { type: 'class', modifiers: [], start: 39, length: 5 },
            { type: 'variable', modifiers: [], start: 49, length: 1 },
            { type: 'variable', modifiers: ['readonly'], start: 55, length: 2 },
            { type: 'class', modifiers: [], start: 59, length: 5 },
        ]);
    });

    test('never', () => {
        const result = semanticTokenizeSampleFile('never.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'class', modifiers: [], start: 19, length: 5 },
            { type: 'variable', modifiers: [], start: 26, length: 3 },
            { type: 'type', modifiers: [], start: 31, length: 5 },
            { type: 'class', modifiers: [], start: 37, length: 3 },
            { type: 'class', modifiers: [], start: 43, length: 5 },
            { type: 'function', modifiers: ['definition'], start: 54, length: 3 },
            { type: 'function', modifiers: [], start: 54, length: 3 },
            { type: 'type', modifiers: [], start: 63, length: 5 },
        ]);
    });

    test('functions', () => {
        const result = semanticTokenizeSampleFile('functions.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 8 },
            { type: 'class', modifiers: [], start: 19, length: 8 },
            { type: 'function', modifiers: ['definition'], start: 34, length: 3 },
            { type: 'function', modifiers: [], start: 34, length: 3 },
            { type: 'variable', modifiers: [], start: 38, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 41, length: 3 },
            { type: 'variable', modifiers: [], start: 47, length: 1 },
            { type: 'variable', modifiers: [], start: 52, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 58, length: 3 },
            { type: 'function', modifiers: [], start: 72, length: 3 },
            { type: 'type', modifiers: [], start: 79, length: 3 },
            { type: 'class', modifiers: [], start: 85, length: 8 },
            { type: 'function', modifiers: [], start: 105, length: 3 },
            { type: 'class', modifiers: [], start: 110, length: 8 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 120, length: 3 },
        ]);
    });
    test('undefined', () => {
        const result = semanticTokenizeSampleFile('undefined.py');
        expect(result).toStrictEqual([]);
    });
    test('type_aliases', () => {
        const result = semanticTokenizeSampleFile('type_aliases.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 9 },
            { type: 'class', modifiers: [], start: 19, length: 9 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 30, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 36, length: 3 },
            { type: 'class', modifiers: [], start: 40, length: 3 },
            { type: 'class', modifiers: [], start: 45, length: 9 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 57, length: 3 },
            { type: 'keyword', modifiers: [], start: 61, length: 4 },
            { type: 'class', modifiers: [], start: 66, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 72, length: 3 },
        ]);
    });

    test('builtins', () => {
        const result = semanticTokenizeSampleFile('builtin_identifiers.py');
        expect(result).toStrictEqual([
            // imports
            // TODO: Fix duplicates
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'class', modifiers: [], start: 19, length: 4 }, // List
            { type: 'class', modifiers: [], start: 19, length: 4 },
            { type: 'class', modifiers: [], start: 25, length: 3 }, // Set
            { type: 'class', modifiers: [], start: 25, length: 3 },
            { type: 'class', modifiers: [], start: 30, length: 9 }, // TypeAlias
            { type: 'class', modifiers: [], start: 30, length: 9 },
            // type aliases
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 41, length: 3 }, // Foo
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 47, length: 4 }, // list
            { type: 'type', modifiers: [], start: 52, length: 3 }, // Bar
            { type: 'class', modifiers: [], start: 58, length: 4 }, // List
            { type: 'class', modifiers: [], start: 65, length: 3 }, // Set
            { type: 'class', modifiers: [], start: 69, length: 3 }, // Old
            { type: 'class', modifiers: [], start: 74, length: 9 }, // TypeAlias
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 86, length: 4 }, // dict
            { type: 'keyword', modifiers: [], start: 91, length: 4 }, // type
            { type: 'class', modifiers: [], start: 96, length: 3 }, // New
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 102, length: 5 }, // tuple
            // builtin functions
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 109, length: 5 }, // print
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 115, length: 5 }, // input
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 121, length: 4 }, // func
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 128, length: 5 }, // print
            // builtin types/classes
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 135, length: 3 }, // int
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 139, length: 3 }, // str
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 143, length: 10 }, // ValueError
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 154, length: 16 }, // EnvironmentError
        ]);
    });

    test('decorators', () => {
        const result = semanticTokenizeSampleFile('decorators.py');
        expect(result).toStrictEqual([
            // TODO: Fix duplicates
            { type: 'namespace', modifiers: [], start: 7, length: 11 }, // dataclasses
            { type: 'namespace', modifiers: [], start: 24, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 43, length: 9 }, // dataclass
            { type: 'function', modifiers: [], start: 43, length: 9 }, // dataclass
            { type: 'namespace', modifiers: [], start: 60, length: 9 }, // functools
            { type: 'namespace', modifiers: [], start: 75, length: 6 }, // typing
            { type: 'function', modifiers: [], start: 89, length: 5 }, // final
            { type: 'function', modifiers: [], start: 89, length: 5 }, // final

            { type: 'class', modifiers: ['definition'], start: 115, length: 1 }, // A
            { type: 'decorator', modifiers: [], start: 96, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 97, length: 9 }, // dataclass
            { type: 'function', modifiers: [], start: 97, length: 9 },
            { type: 'class', modifiers: [], start: 115, length: 1 },

            { type: 'class', modifiers: ['definition'], start: 154, length: 1 }, // B
            { type: 'decorator', modifiers: [], start: 123, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 136, length: 9 }, // dataclass
            { type: 'namespace', modifiers: [], start: 124, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 136, length: 9 },
            { type: 'class', modifiers: [], start: 154, length: 1 },
            { type: 'method', modifiers: ['definition'], start: 176, length: 6 }, // method
            { type: 'decorator', modifiers: [], start: 161, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 162, length: 5 }, // final
            { type: 'function', modifiers: [], start: 162, length: 5 },
            { type: 'method', modifiers: [], start: 176, length: 6 },
            { type: 'variable', modifiers: [], start: 183, length: 4 }, // self
            { type: 'method', modifiers: ['definition'], start: 220, length: 6 }, // static
            { type: 'decorator', modifiers: [], start: 198, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 199, length: 12 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 199, length: 12 }, // staticmethod
            { type: 'method', modifiers: [], start: 220, length: 6 },

            { type: 'function', modifiers: ['definition'], start: 256, length: 6 }, // cached
            { type: 'decorator', modifiers: [], start: 235, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 246, length: 5 }, // cache
            { type: 'namespace', modifiers: [], start: 236, length: 9 }, // functools
            { type: 'function', modifiers: [], start: 246, length: 5 },
            { type: 'function', modifiers: [], start: 256, length: 6 },
        ]);
    });
} else {
    // prevent jest from failing because no tests were found
    test('windows placeholder', () => {});
}
