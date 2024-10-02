/*
 * jest.config.js
 *
 * Configuration for jest tests.
 */

/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
const config = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/tests'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'src/tests/tsconfig.json',
            },
        ],
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    setupFiles: ['./src/tests/setupTests.ts'],
};

module.exports = config;
