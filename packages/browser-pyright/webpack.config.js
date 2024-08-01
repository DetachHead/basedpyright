/**
 * webpack.config-cli.js
 * Copyright: Microsoft 2018
 */

const path = require('path');
const { DefinePlugin, ProvidePlugin } = require('webpack');
const VirtualModulesPlugin = require('webpack-virtual-modules');
const fs = require('fs/promises');
const { readFileSync } = require('fs');
const { cacheConfig, monorepoResourceNameMapper, tsconfigResolveAliases } = require('../../build/lib/webpack');

const outPath = path.resolve(__dirname, 'dist');

const typeshedFallback = path.resolve(__dirname, '..', '..', 'docstubs');

/**@type {(env: any, argv: { mode: 'production' | 'development' | 'none' }) => Promise<import('webpack').Configuration>}*/
module.exports = async (_, { mode }) => {
    return {
        context: __dirname,
        entry: {
            pyright: './src/worker.ts',
        },
        output: {
            filename: '[name].worker.js',
            path: outPath,
            devtoolModuleFilenameTemplate:
                mode === 'development' ? '../[resource-path]' : monorepoResourceNameMapper('pyright'),
            clean: true,
        },
        devtool: mode === 'development' ? 'source-map' : 'nosources-source-map',
        cache: mode === 'development' ? cacheConfig(__dirname, __filename) : false,
        stats: {
            all: false,
            errors: true,
            warnings: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: tsconfigResolveAliases('tsconfig.json'),
            fallback: {
                // There's a lot of code we're pulling in that uses NodeJS.
                //  Much of it should be cut out by refactoring but for now we hack it out.

                // At least TestFileSystem, which perhaps we should replace
                // to avoid buffer polyfill
                buffer: require.resolve('buffer/'),
                // pythonPathUtils.ts but shouldn't be used as it execs python, configOptions.ts but we avoid reading from disk
                child_process: false,
                // Falls back to web crypto.
                crypto: false,
                // Needs at least path.sep in pathUtils.ts, pathValidation.ts etc.
                path: require.resolve('path-browserify'),
                // TOML parsing which we don't use
                stream: false,
                // fileBasedCancellationUtils (we've removed the RealFileSystem)
                fs: false,
                os: false,
                v8: false,
            },
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
        plugins: [
            new DefinePlugin({
                // Just enough to avoid the memory check that pyright performs in pyright-internal/src/analyzer/program.ts
                process: "{ env: {}, execArgv: [], cwd: () => '/', memoryUsage: () => ({heapUsed: 0, rss: 1}) }",
            }),
            new ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
            }),
            new VirtualModulesPlugin({
                'node_modules/typeshed-json': `module.exports = ${JSON.stringify(
                    (await fs.readdir(typeshedFallback, { recursive: true, withFileTypes: true }))
                        .filter((entry) => entry.isFile())
                        .map((file) => [
                            '/' +
                                path
                                    .join('typeshed', path.relative(typeshedFallback, file.parentPath), file.name)
                                    .replaceAll(path.win32.sep, path.posix.sep),
                            readFileSync(path.join(file.parentPath, file.name), { encoding: 'utf8' }),
                        ])
                        .reduce(
                            (prev, [currentFile, currentFileContents]) => ({
                                ...prev,
                                [currentFile]: currentFileContents,
                            }),
                            {}
                        )
                )}`,
            }),
        ],
    };
};
