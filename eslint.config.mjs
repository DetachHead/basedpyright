import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslintEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default config([
    globalIgnores([
        '**/dist/**/*',
        '**/out/**/*',
        '**/node_modules/**/*',
        '**/tests/fourslash/**/*',
        '**/.pyprojectx',
        '**/.venv/**/*',
    ]),
    {
        extends: compat.extends('eslint:recommended', 'prettier', 'plugin:@typescript-eslint/recommended'),

        plugins: {
            '@typescript-eslint': typescriptEslintEslintPlugin,
            'simple-import-sort': simpleImportSort,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: 2019,
            sourceType: 'commonjs',
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        rules: {
            eqeqeq: 'error',
            'no-constant-condition': 0,
            'no-inner-declarations': 0,
            'no-unused-vars': 'off',
            'no-undef': 0,
            'simple-import-sort/exports': 'error',
            '@typescript-eslint/explicit-function-return-type': 0,
            '@typescript-eslint/explicit-module-boundary-types': 0,
            '@typescript-eslint/ban-types': 0,
            '@typescript-eslint/camelcase': 0,

            '@typescript-eslint/member-ordering': [
                'error',
                {
                    classes: [
                        'field',
                        'constructor',
                        ['public-get', 'public-set'],
                        'public-method',
                        ['protected-get', 'protected-set'],
                        'protected-method',
                        ['private-get', 'private-set'],
                        'private-method',
                    ],

                    interfaces: [],
                },
            ],

            '@typescript-eslint/no-empty-interface': 0,
            '@typescript-eslint/no-explicit-any': 0,
            '@typescript-eslint/no-namespace': 0,
            '@typescript-eslint/no-non-null-assertion': 0,
            '@typescript-eslint/no-this-alias': 0,

            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                {
                    accessibility: 'no-public',
                },
            ],

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'none',
                },
            ],

            '@typescript-eslint/no-use-before-define': 0,

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: [
                        'classProperty',
                        'typeProperty',
                        'parameterProperty',
                        'classMethod',
                        'typeMethod',
                        'accessor',
                    ],

                    modifiers: ['private'],
                    leadingUnderscore: 'require',
                    format: ['camelCase'],

                    filter: {
                        regex: '^(test_| )',
                        match: false,
                    },
                },
                {
                    selector: [
                        'classProperty',
                        'typeProperty',
                        'parameterProperty',
                        'classMethod',
                        'typeMethod',
                        'accessor',
                    ],

                    modifiers: ['protected'],
                    leadingUnderscore: 'forbid',
                    format: ['camelCase'],

                    filter: {
                        regex: '^(test_| )',
                        match: false,
                    },
                },
                {
                    selector: [
                        'classProperty',
                        'typeProperty',
                        'parameterProperty',
                        'classMethod',
                        'typeMethod',
                        'accessor',
                    ],

                    modifiers: ['public'],
                    leadingUnderscore: 'forbid',
                    format: ['camelCase'],

                    filter: {
                        regex: '^(test_| )',
                        match: false,
                    },
                },
            ],
            '@typescript-eslint/no-empty-function': 'error',
        },
    },
    {
        files: ['**/*.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 0,
        },
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module',
        },
    },
]);
