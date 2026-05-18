/*
 * autoImporter.test.ts
 * Tests for auto-import completion logic.
 */

import * as assert from 'assert';

import { ImportResolver } from '../analyzer/importResolver';
import { Program } from '../analyzer/program';
import { IPythonMode } from '../analyzer/sourceFile';
import { ConfigOptions } from '../common/configOptions';
import { normalizeSlashes } from '../common/pathUtils';
import { createServiceProvider } from '../common/serviceProviderExtensions';
import { UriEx } from '../common/uri/uriUtils';
import { buildModuleSymbolsMap } from '../languageService/autoImporter';
import { PyrightFileSystem } from '../pyrightFileSystem';
import { TestAccessHost } from './harness/testAccessHost';
import { TestFileSystem } from './harness/vfs/filesystem';

function createTestFileSystem(files: { path: string; content: string }[]): TestFileSystem {
    const fs = new TestFileSystem(/* ignoreCase */ false, { cwd: normalizeSlashes('/') });

    for (const file of files) {
        fs.mkdirpSync(normalizeSlashes(file.path).replace(/\/[^/]+$/, ''));
        fs.writeFileSync(UriEx.file(normalizeSlashes(file.path)), file.content);
    }

    return fs;
}

test('buildModuleSymbolsMap includes symbols from unbound tracked workspace files', () => {
    const projectRoot = normalizeSlashes('/project');
    const files = [
        {
            path: `${projectRoot}/pack1/__init__.py`,
            content: '',
        },
        {
            path: `${projectRoot}/pack1/mod1.py`,
            content: 'def some_function(arg: str):\n    ...\n',
        },
        {
            path: `${projectRoot}/pack2/__init__.py`,
            content: '',
        },
        {
            path: `${projectRoot}/pack2/mod2.py`,
            content: '# empty\n',
        },
    ];

    const testFS = createTestFileSystem(files);
    const fs = new PyrightFileSystem(testFS);
    const serviceProvider = createServiceProvider(testFS, fs);
    const configOptions = new ConfigOptions(UriEx.file(projectRoot));
    configOptions.autoImportCompletions = true;
    configOptions.internalTestMode = true;

    const importResolver = new ImportResolver(
        serviceProvider,
        configOptions,
        new TestAccessHost(serviceProvider.fs().getModulePath(), [])
    );
    const program = new Program(importResolver, configOptions, serviceProvider);

    const mod1Uri = UriEx.file(`${projectRoot}/pack1/mod1.py`);
    const mod2Uri = UriEx.file(`${projectRoot}/pack2/mod2.py`);

    program.setTrackedFiles([mod1Uri, mod2Uri]);
    program.setFileOpened(mod2Uri, 1, '# empty\n', {
        isTracked: true,
        ipythonMode: IPythonMode.None,
        chainedFileUri: undefined,
    });

    // Simulate a session where only the active file has been bound so far.
    program.getParseResults(mod2Uri);
    assert.strictEqual(program.getModuleSymbolTable(mod1Uri), undefined);

    const mod1Info = program.getSourceFileInfo(mod1Uri)!;
    const defaultModuleSymbolMap = buildModuleSymbolsMap(program, [mod1Info]);
    assert.strictEqual(defaultModuleSymbolMap.size, 0);
    assert.strictEqual(program.getModuleSymbolTable(mod1Uri), undefined);

    const moduleSymbolMap = buildModuleSymbolsMap(program, [mod1Info], { bindUnboundUserCode: true });

    let foundSomeFunction = false;
    moduleSymbolMap.forEach((table) => {
        for (const symbol of table.getSymbols()) {
            if (symbol.name === 'some_function') {
                foundSomeFunction = true;
            }
        }
    });

    assert.strictEqual(
        foundSomeFunction,
        true,
        'Expected some_function from an unbound tracked file to appear in the module symbol map'
    );

    program.dispose();
});
