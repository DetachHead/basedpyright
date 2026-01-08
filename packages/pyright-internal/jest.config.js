/*
 * jest.config.js
 *
 * Configuration for jest tests.
 */

module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/tests'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'src/tests/tsconfig.json',
                diagnostics: {
                    ignoreCodes: [151002],
                },
            },
        ],
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    setupFiles: ['./src/tests/setupTests.ts'],
};
