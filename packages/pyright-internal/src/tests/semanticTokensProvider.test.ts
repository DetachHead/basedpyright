import { semanticTokenizeSampleFile } from './testUtils';

//TODO: these tests have different start positions in ci on windows, i assume because of crlf moment
if (process.platform !== 'win32' || !process.env['CI']) {
    test('variable', () => {
        const result = semanticTokenizeSampleFile('variable.py');
        expect(result).toStrictEqual([
            { type: 'variable', start: 0, length: 3, modifiers: [] },
            { type: 'variable', start: 8, length: 3, modifiers: [] },
            { type: 'variable', start: 20, length: 3, modifiers: [] },
        ]);
    });

    test('enum', () => {
        const result = semanticTokenizeSampleFile('enum.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 4 },
            { type: 'enum', modifiers: [], start: 17, length: 7 },
            { type: 'enum', modifiers: ['declaration'], start: 33, length: 11 },
            { type: 'enum', modifiers: [], start: 45, length: 7 },
            { type: 'enumMember', modifiers: [], start: 59, length: 3 },
            { type: 'enumMember', modifiers: [], start: 71, length: 2 },
            { type: 'variable', modifiers: [], start: 79, length: 1 },
            { type: 'enum', modifiers: [], start: 83, length: 11 },
            { type: 'enumMember', modifiers: [], start: 95, length: 3 },
        ]);
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
            { type: 'namespace', modifiers: [], start: 7, length: 4 }, // json
            { type: 'namespace', modifiers: [], start: 19, length: 4 }, // json
            { type: 'namespace', modifiers: [], start: 27, length: 4 }, // JSON
            { type: 'namespace', modifiers: [], start: 39, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 42, length: 4 }, // path
            { type: 'namespace', modifiers: [], start: 50, length: 2 }, // p1
            { type: 'namespace', modifiers: [], start: 58, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 68, length: 4 }, // path
            { type: 'namespace', modifiers: [], start: 76, length: 2 }, // p2
            { type: 'namespace', modifiers: [], start: 84, length: 2 }, // re
            { type: 'function', modifiers: [], start: 94, length: 5 }, // match
            { type: 'function', modifiers: [], start: 101, length: 6 }, // search
            { type: 'function', modifiers: [], start: 111, length: 1 }, // s
            { type: 'variable', modifiers: ['readonly'], start: 114, length: 10 }, // IGNORECASE
            { type: 'namespace', modifiers: [], start: 130, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 144, length: 5 }, // Never
            { type: 'class', modifiers: [], start: 151, length: 8 }, // Iterable
            { type: 'class', modifiers: [], start: 163, length: 3 }, // Foo
            { type: 'namespace', modifiers: [], start: 172, length: 11 }, // collections
            { type: 'namespace', modifiers: [], start: 184, length: 3 }, // abc
            { type: 'class', modifiers: [], start: 195, length: 8 }, // Iterator
        ]);
    });

    test('final', () => {
        const result = semanticTokenizeSampleFile('final.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 4 },
            { type: 'variable', modifiers: ['readonly'], start: 17, length: 2 },
            { type: 'namespace', modifiers: [], start: 25, length: 6 },
            { type: 'class', modifiers: [], start: 39, length: 5 },
            { type: 'function', modifiers: [], start: 46, length: 8 },
            { type: 'variable', modifiers: ['readonly'], start: 56, length: 3 },
            { type: 'variable', modifiers: ['readonly'], start: 64, length: 3 },
            { type: 'class', modifiers: [], start: 69, length: 5 },
            { type: 'variable', modifiers: [], start: 79, length: 1 },
            { type: 'variable', modifiers: ['readonly'], start: 85, length: 2 },
            { type: 'class', modifiers: [], start: 89, length: 5 },
            { type: 'class', modifiers: ['declaration'], start: 107, length: 3 },
            { type: 'method', modifiers: ['declaration'], start: 120, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 129, length: 4 },
            { type: 'selfParameter', modifiers: [], start: 144, length: 4 },
            { type: 'property', modifiers: ['readonly'], start: 149, length: 8 },
            { type: 'class', modifiers: [], start: 159, length: 5 },
            { type: 'property', modifiers: ['declaration'], start: 193, length: 3 },
            { type: 'decorator', modifiers: [], start: 175, length: 1 },
            { type: 'decorator', modifiers: [], start: 176, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 197, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 206, length: 3 },
            { type: 'property', modifiers: ['declaration'], start: 238, length: 3 },
            { type: 'decorator', modifiers: [], start: 220, length: 1 },
            { type: 'decorator', modifiers: [], start: 221, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 242, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 251, length: 3 },
            { type: 'property', modifiers: ['declaration'], start: 284, length: 3 },
            { type: 'decorator', modifiers: [], start: 264, length: 1 },
            { type: 'property', modifiers: ['readonly'], start: 265, length: 3 },
            { type: 'function', modifiers: [], start: 269, length: 6 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 288, length: 4 },
            { type: 'parameter', modifiers: ['declaration'], start: 294, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 301, length: 3 },
            { type: 'method', modifiers: ['declaration'], start: 320, length: 11 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 332, length: 4 },
            { type: 'parameter', modifiers: ['declaration'], start: 338, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 344, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 352, length: 5 },
            { type: 'variable', modifiers: ['readonly'], start: 374, length: 2 },
            { type: 'class', modifiers: ['declaration'], start: 385, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 394, length: 3 },
            { type: 'class', modifiers: [], start: 399, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 405, length: 3 },
            { type: 'method', modifiers: ['declaration'], start: 425, length: 11 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 437, length: 4 },
            { type: 'parameter', modifiers: ['declaration'], start: 443, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 449, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 457, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 477, length: 3 },
            { type: 'parameter', modifiers: [], start: 481, length: 4 },
            { type: 'method', modifiers: ['declaration'], start: 510, length: 11 },
            { type: 'decorator', modifiers: [], start: 492, length: 1 },
            { type: 'decorator', modifiers: [], start: 493, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration'], start: 522, length: 4 },
            { type: 'parameter', modifiers: ['declaration'], start: 528, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 534, length: 3 },
            { type: 'parameter', modifiers: ['declaration'], start: 539, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 546, length: 3 },
            { type: 'class', modifiers: [], start: 567, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 573, length: 3 },
            { type: 'class', modifiers: [], start: 577, length: 3 },
            { type: 'property', modifiers: [], start: 583, length: 3 },
            { type: 'variable', modifiers: [], start: 588, length: 3 },
            { type: 'class', modifiers: [], start: 594, length: 3 },
            { type: 'variable', modifiers: [], start: 600, length: 1 },
            { type: 'variable', modifiers: [], start: 604, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 608, length: 3 },
            { type: 'variable', modifiers: [], start: 612, length: 7 },
            { type: 'variable', modifiers: [], start: 622, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 626, length: 8 },
            { type: 'variable', modifiers: [], start: 635, length: 3 },
            { type: 'variable', modifiers: [], start: 641, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 645, length: 2 },
            { type: 'class', modifiers: [], start: 650, length: 3 },
            { type: 'property', modifiers: ['readonly'], start: 654, length: 3 },
            { type: 'variable', modifiers: [], start: 658, length: 3 },
            { type: 'class', modifiers: [], start: 664, length: 3 },
            { type: 'property', modifiers: [], start: 670, length: 4 },
        ]);
    });

    test('never', () => {
        const result = semanticTokenizeSampleFile('never.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 19, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 26, length: 3 }, // foo
            { type: 'type', modifiers: [], start: 31, length: 5 }, // Never
            { type: 'type', modifiers: [], start: 37, length: 3 }, // bar
            { type: 'type', modifiers: [], start: 43, length: 5 }, // Never
            { type: 'function', modifiers: ['declaration'], start: 54, length: 3 }, // baz
            { type: 'type', modifiers: [], start: 63, length: 5 }, // Never
            { type: 'function', modifiers: ['declaration'], start: 83, length: 4 }, // asdf
            { type: 'parameter', modifiers: ['declaration'], start: 88, length: 3 }, // foo
            { type: 'type', modifiers: [], start: 93, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 105, length: 5 }, // value
            { type: 'type', modifiers: [], start: 112, length: 5 }, // Never
            { type: 'parameter', modifiers: [], start: 120, length: 3 }, // foo
            { type: 'variable', modifiers: [], start: 128, length: 5 }, // value
            { type: 'type', modifiers: [], start: 135, length: 4 }, // Type
            { type: 'type', modifiers: [], start: 142, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 148, length: 5 }, // value
            { type: 'type', modifiers: [], start: 155, length: 4 }, // Type
            { type: 'function', modifiers: ['declaration'], start: 169, length: 8 }, // inferred
            { type: 'variable', modifiers: [], start: 185, length: 5 }, // value
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 207, length: 10 }, // isinstance
            { type: 'variable', modifiers: [], start: 218, length: 5 }, // value
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 225, length: 3 }, // str
            { type: 'variable', modifiers: [], start: 239, length: 5 }, // value
            { type: 'variable', modifiers: [], start: 254, length: 6 }, // value2
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 262, length: 3 }, // str
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 282, length: 10 }, // isinstance
            { type: 'variable', modifiers: [], start: 293, length: 6 }, // value2
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 301, length: 3 }, // str
            { type: 'variable', modifiers: [], start: 315, length: 6 }, // value2
            { type: 'keyword', modifiers: [], start: 323, length: 4 }, // type
            { type: 'type', modifiers: [], start: 328, length: 3 }, // Baz
            { type: 'type', modifiers: [], start: 334, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 340, length: 3 }, // baz
            { type: 'type', modifiers: [], start: 345, length: 3 }, // Baz
        ]);
    });

    test('functions', () => {
        const result = semanticTokenizeSampleFile('functions.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 8 },
            { type: 'function', modifiers: ['declaration'], start: 34, length: 3 },
            { type: 'parameter', modifiers: ['declaration'], start: 38, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 41, length: 3 },
            { type: 'parameter', modifiers: ['declaration'], start: 47, length: 1 },
            { type: 'parameter', modifiers: ['declaration'], start: 52, length: 1 },
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

    test('decorators', () => {
        const result = semanticTokenizeSampleFile('decorators.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 7, length: 11 }, // dataclasses
            { type: 'namespace', modifiers: [], start: 26, length: 9 }, // functools
            { type: 'namespace', modifiers: [], start: 41, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 60, length: 9 }, // dataclasses
            { type: 'namespace', modifiers: [], start: 75, length: 6 }, // typing
            { type: 'function', modifiers: [], start: 89, length: 5 }, // final

            { type: 'class', modifiers: ['declaration'], start: 116, length: 1 }, // A
            { type: 'decorator', modifiers: [], start: 97, length: 1 }, // @
            { type: 'function', modifiers: [], start: 98, length: 9 },

            { type: 'class', modifiers: ['declaration'], start: 155, length: 1 }, // B
            { type: 'decorator', modifiers: [], start: 124, length: 1 }, // @
            { type: 'namespace', modifiers: [], start: 125, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 137, length: 9 }, // dataclass
            { type: 'method', modifiers: ['declaration'], start: 177, length: 6 }, // method
            { type: 'decorator', modifiers: [], start: 162, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 163, length: 5 }, // final
            { type: 'selfParameter', modifiers: ['declaration'], start: 184, length: 4 }, // self
            { type: 'method', modifiers: ['declaration', 'static'], start: 221, length: 6 }, // static
            { type: 'decorator', modifiers: [], start: 199, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 200, length: 12 },

            { type: 'function', modifiers: ['declaration'], start: 257, length: 6 }, // cached
            { type: 'decorator', modifiers: [], start: 236, length: 1 }, // @
            { type: 'namespace', modifiers: [], start: 237, length: 9 }, // functools
            { type: 'function', modifiers: [], start: 247, length: 5 }, // cache
            { type: 'class', modifiers: [], start: 272, length: 1 }, // B
            { type: 'method', modifiers: ['static'], start: 274, length: 6 }, // static
        ]);
    });

    test('parameters', () => {
        const result = semanticTokenizeSampleFile('parameters.py');
        expect(result).toStrictEqual([
            // method
            { type: 'class', modifiers: ['declaration'], start: 6, length: 1 }, // C
            { type: 'method', modifiers: ['declaration'], start: 17, length: 8 }, // __init__
            { type: 'selfParameter', modifiers: ['declaration'], start: 26, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration'], start: 32, length: 1 }, // x
            { type: 'selfParameter', modifiers: [], start: 44, length: 4 }, // self
            { type: 'property', modifiers: [], start: 49, length: 1 }, // x
            { type: 'parameter', modifiers: [], start: 53, length: 1 }, // x
            { type: 'method', modifiers: ['declaration'], start: 81, length: 1 }, // m
            { type: 'decorator', modifiers: [], start: 60, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 61, length: 11 },
            { type: 'clsParameter', modifiers: ['declaration'], start: 83, length: 3 }, // cls
            { type: 'clsParameter', modifiers: [], start: 104, length: 3 }, // cls
            // function
            { type: 'function', modifiers: ['declaration'], start: 116, length: 1 }, // f
            { type: 'parameter', modifiers: ['declaration'], start: 118, length: 1 }, // x
            { type: 'parameter', modifiers: ['declaration'], start: 121, length: 1 }, // y
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 124, length: 3 }, // int
            { type: 'function', modifiers: ['declaration'], start: 138, length: 1 }, // g
            { type: 'parameter', modifiers: ['declaration'], start: 140, length: 1 }, // x
            { type: 'parameter', modifiers: [], start: 159, length: 1 }, // x
            { type: 'parameter', modifiers: [], start: 163, length: 1 }, // y
            { type: 'variable', modifiers: [], start: 169, length: 1 }, // z
            { type: 'parameter', modifiers: [], start: 177, length: 1 }, // x
            { type: 'function', modifiers: [], start: 190, length: 1 }, // g
            { type: 'variable', modifiers: [], start: 192, length: 1 }, // z
            // lambda
            { type: 'parameter', modifiers: ['declaration'], start: 203, length: 1 }, // a
            { type: 'parameter', modifiers: ['declaration'], start: 206, length: 1 }, // b
            { type: 'parameter', modifiers: [], start: 209, length: 1 }, // a
            { type: 'parameter', modifiers: [], start: 213, length: 1 }, // b
        ]);
    });

    test('Unknown and Any', () => {
        const result = semanticTokenizeSampleFile('unknown.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 19, length: 3 }, // Any
            { type: 'function', modifiers: ['declaration'], start: 28, length: 1 }, // f
            { type: 'parameter', modifiers: ['declaration'], start: 30, length: 1 }, // l
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 33, length: 4 }, // list
            { type: 'type', modifiers: [], start: 42, length: 3 }, // Any
            { type: 'variable', modifiers: [], start: 51, length: 1 }, // v
            { type: 'parameter', modifiers: [], start: 55, length: 1 }, // l
            { type: 'variable', modifiers: [], start: 71, length: 1 }, // v
            // `g` and `foo` should be ignored
            { type: 'variable', modifiers: [], start: 81, length: 3 }, // bar
            { type: 'function', modifiers: [], start: 87, length: 1 }, // f
        ]);
    });

    describe('builtins', () => {
        test('real builtins', () => {
            const result = semanticTokenizeSampleFile('builtin_identifiers.py');
            expect(result).toStrictEqual([
                // imports
                { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
                { type: 'class', modifiers: [], start: 19, length: 4 }, // List
                { type: 'class', modifiers: [], start: 25, length: 3 }, // Set
                { type: 'class', modifiers: [], start: 30, length: 9 }, // TypeAlias
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

        test('project builtins', () => {
            const resultNoBuiltins = semanticTokenizeSampleFile('project_builtins.py');
            expect(resultNoBuiltins).toStrictEqual([
                { type: 'variable', modifiers: [], start: 0, length: 1 },
                { type: 'variable', modifiers: [], start: 6, length: 1 },
                { type: 'variable', modifiers: [], start: 10, length: 1 },
                // this `some_global` is referrring to the the builtin
                { type: 'variable', modifiers: ['builtin'], start: 14, length: 11 },
                // inside scope()...
                { type: 'function', modifiers: ['declaration'], start: 31, length: 5 },
                // this `some_global` is redefined inside the function scope
                { type: 'variable', modifiers: [], start: 44, length: 11 },
                { type: 'variable', modifiers: [], start: 64, length: 1 },
                { type: 'variable', modifiers: [], start: 68, length: 1 },
                // so this `some_global` refers to the redefined one, not to the builtin
                { type: 'variable', modifiers: [], start: 72, length: 11 },
                // inside in_function()...
                { type: 'function', modifiers: ['declaration'], start: 90, length: 11 },
                { type: 'variable', modifiers: [], start: 109, length: 1 },
                { type: 'variable', modifiers: [], start: 113, length: 1 },
                // this function is similar to scope(), but we don't redefine some_global, so it refers to the builtin
                { type: 'variable', modifiers: ['builtin'], start: 117, length: 11 },
            ]);
        });
    });
} else {
    // prevent jest from failing because no tests were found
    test('windows placeholder', () => {});
}
