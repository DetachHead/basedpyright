/**
 * webpack.config-cli.js
 * Copyright: Microsoft 2018
 */

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { cacheConfig, monorepoResourceNameMapper, tsconfigResolveAliases } = require('../../build/lib/webpack');

const outPath = path.resolve(__dirname, 'dist');
const typeshedFallback = path.resolve(__dirname, '..', 'pyright-internal', 'typeshed-fallback');

/**@typedef {(env: any, argv: { mode: 'production' | 'development' | 'none' }) => import('webpack').Configuration} WebpackConfig */

/**@type {WebpackConfig} */
const webConfig = (_, { mode }) => {
    return {
        context: __dirname,
        entry: {
            webExtension: './src/webExtension.ts',
            server: './src/webServer.ts',
        },
        target: 'webworker',
        output: {
            filename: '[name].js',
            path: outPath,
            libraryTarget: 'commonjs2',
            devtoolModuleFilenameTemplate:
                mode === 'development' ? '../[resource-path]' : monorepoResourceNameMapper('vscode-pyright'),
            clean: true,
        },
        devtool: mode === 'development' ? 'source-map' : 'nosources-source-map',
        cache: mode === 'development' ? cacheConfig(__dirname, __filename) : false,
        stats: {
            all: false,
            errors: true,
            warnings: true,
            publicPath: true,
            timings: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: tsconfigResolveAliases('tsconfig.json'),
            fallback: {
                path: require.resolve('path-browserify'),
                os: require.resolve('os-browserify/browser'),
                util: require.resolve('util/'),
                crypto: require.resolve('crypto-browserify'),
                vm: require.resolve('vm-browserify'),
                stream: require.resolve('stream-browserify'),
                buffer: require.resolve('buffer'),
                fs: './src/webFs.ts',
            },
        },
        externals: {
            vscode: 'commonjs vscode',
            fsevents: 'commonjs2 fsevents',
            v8: 'commonjs2 v8', // this probably doesn't work, but the import is in a try/catch anyway and we don't actually need it
            fs: 'commonjs2 fs',
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.json',
                    },
                },
            ],
        },
        plugins: [new CopyPlugin({ patterns: [{ from: typeshedFallback, to: 'typeshed-fallback' }] })],
    };
};

/**@type {WebpackConfig} */
const nodeConfig = (_, { mode }) => {
    return {
        context: __dirname,
        entry: {
            extension: './src/extension.ts',
            server: './src/server.ts',
        },
        target: 'node',
        output: {
            filename: '[name].js',
            path: outPath,
            libraryTarget: 'commonjs2',
            devtoolModuleFilenameTemplate:
                mode === 'development' ? '../[resource-path]' : monorepoResourceNameMapper('vscode-pyright'),
            clean: true,
        },
        devtool: mode === 'development' ? 'source-map' : 'nosources-source-map',
        cache: mode === 'development' ? cacheConfig(__dirname, __filename) : false,
        stats: {
            all: false,
            errors: true,
            warnings: true,
            publicPath: true,
            timings: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: tsconfigResolveAliases('tsconfig.json'),
        },
        externals: {
            vscode: 'commonjs vscode',
            fsevents: 'commonjs2 fsevents',
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.json',
                    },
                },
            ],
        },
        plugins: [new CopyPlugin({ patterns: [{ from: typeshedFallback, to: 'typeshed-fallback' }] })],
    };
};

module.exports = [webConfig, nodeConfig];
