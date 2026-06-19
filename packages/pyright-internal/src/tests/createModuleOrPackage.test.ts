import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { SignatureDisplayType } from '../common/configOptions';
import { LogLevel, NullConsole } from '../common/console';
import { LanguageServerInterface, MessageAction, WindowInterface } from '../common/languageServerInterface';
import { ServiceProvider } from '../common/serviceProvider';
import { createServiceProvider } from '../common/serviceProviderExtensions';
import { Uri } from '../common/uri/uri';
import { WellKnownWorkspaceKinds, Workspace, createInitStatus } from '../workspaceFactory';
import { CreateModuleCommand, CreatePackageCommand } from '../commands/createModuleOrPackage';
import { setLocaleOverride } from '../localization/localize';
import { TestFileSystem } from './harness/vfs/filesystem';

// message reports from LSP uses system locale settings.
// other test files should also be fixed.
setLocaleOverride('en-us');

interface CapturedMessage {
    type: 'error' | 'warning' | 'info';
    text: string;
}

class MockWindow implements WindowInterface {
    private _text = '';
    messages: CapturedMessage[] = [];

    get statusBarText(): string {
        return this._text;
    }
    set statusBarText(value: string) {
        this._text = value;
    }

    showErrorMessage(message: string): void;
    showErrorMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;
    showErrorMessage(message: string, ..._actions: MessageAction[]): void | Promise<MessageAction | undefined> {
        this.messages.push({ type: 'error', text: message });
        return undefined;
    }
    showWarningMessage(message: string): void;
    showWarningMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;
    showWarningMessage(message: string, ..._actions: MessageAction[]): void | Promise<MessageAction | undefined> {
        this.messages.push({ type: 'warning', text: message });
        return undefined;
    }
    showInformationMessage(message: string): void;
    showInformationMessage(message: string, ...actions: MessageAction[]): Promise<MessageAction | undefined>;
    showInformationMessage(
        message: string,
        ..._actions: MessageAction[]
    ): void | Promise<MessageAction | undefined> {
        this.messages.push({ type: 'info', text: message });
        return undefined;
    }
}

const _mockCancellationToken: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
};

function createMockLanguageServerInterface(testFS: TestFileSystem, window: MockWindow): LanguageServerInterface {
    const sp = createServiceProvider(testFS);

    const mockWorkspace: Workspace = {
        workspaceName: 'test',
        rootUri: Uri.file('/project', sp),
        kinds: [WellKnownWorkspaceKinds.Test],
        service: {
            fs: testFS,
        } as unknown as Workspace['service'],
        disableLanguageServices: false,
        disableTaggedHints: false,
        disableOrganizeImports: false,
        disableWorkspaceSymbol: false,
        isInitialized: createInitStatus(),
        searchPathsToWatch: [],
        useTypingExtensions: false,
        fileEnumerationTimeoutInSec: 10,
        autoFormatStrings: true,
        baselineMode: 'auto',
    };

    return {
        serviceProvider: sp,
        console: new NullConsole(),
        window,
        supportAdvancedEdits: false,
        createBackgroundAnalysis: () => undefined,
        reanalyze: () => {},
        restart: () => {},
        getWorkspaces: async () => [mockWorkspace],
        getSettings: async () => ({
            watchForSourceChanges: true,
            watchForLibraryChanges: true,
            watchForConfigChanges: true,
            openFilesOnly: true,
            useLibraryCodeForTypes: true,
            disableLanguageServices: false,
            disableTaggedHints: false,
            disableOrganizeImports: false,
            typeCheckingMode: 'off',
            diagnosticSeverityOverrides: {},
            logLevel: LogLevel.Info,
            autoImportCompletions: true,
            functionSignatureDisplay: SignatureDisplayType.formatted,
            inlayHints: {
                callArgumentNames: true,
                callArgumentNamesMatching: false,
                functionReturnTypes: true,
                variableTypes: true,
                genericTypes: false,
            },
            useTypingExtensions: false,
        }),
        getWorkspaceForFile: async () => mockWorkspace,
        convertUriToLspUriString: (_fs, uri) => uri.toString(),
        documentsWithDiagnostics: {},
    };
}

function makeArgs(args: (string | undefined)[]): ExecuteCommandParams {
    return { command: 'test.command', arguments: args };
}

describe('CreateModuleCommand', () => {
    let testFS: TestFileSystem;
    let window: MockWindow;
    let ls: LanguageServerInterface;
    let cmd: CreateModuleCommand;
    let projectDir: Uri;
    let sp: ServiceProvider;

    beforeEach(() => {
        testFS = new TestFileSystem(false, { cwd: '/' });
        sp = createServiceProvider(testFS);
        projectDir = Uri.file('/project', sp);
        testFS.mkdirSync(projectDir, { recursive: true });
        window = new MockWindow();
        ls = createMockLanguageServerInterface(testFS, window);
        cmd = new CreateModuleCommand(ls);
    });

    // --- golden path ---

    it('creates a module file in the target directory', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my_module']);

        await cmd.execute(args, _mockCancellationToken);

        const moduleUri = projectDir.combinePaths('my_module.py');
        expect(testFS.existsSync(moduleUri)).toBe(true);
        expect(testFS.readFileSync(moduleUri, 'utf-8')).toBe('');
        expect(window.messages).toEqual([
            { type: 'info', text: expect.stringContaining('Created module "my_module.py"') },
        ]);
    });

    it('strips .py extension from the input name', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my_module.py']);

        await cmd.execute(args, _mockCancellationToken);

        expect(testFS.existsSync(projectDir.combinePaths('my_module.py'))).toBe(true);
    });

    // --- target directory errors ---

    it('shows error if target directory does not exist', async () => {
        const missingDir = projectDir.combinePaths('nope');
        const args = makeArgs([projectDir.toString(), missingDir.toString(), 'my_module']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('does not exist'),
        });
    });

    it('falls back to parent directory when target is a file', async () => {
        const filePath = projectDir.combinePaths('somefile.py');
        testFS.writeFileSync(filePath, '# content', 'utf-8');

        const args = makeArgs([projectDir.toString(), filePath.toString(), 'new_module']);

        await cmd.execute(args, _mockCancellationToken);

        expect(testFS.existsSync(projectDir.combinePaths('new_module.py'))).toBe(true);
        expect(window.messages[0]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
    });

    // --- name validation: errors (abort creation) ---

    it('shows error for name with NTFS forbidden characters', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'bad:name']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages).toEqual([
            {
                type: 'error',
                text: expect.stringContaining('contains characters that are not allowed in file names'),
            },
        ]);
    });

    it('shows error for name containing a dot', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my.module']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages).toEqual([
            {
                type: 'error',
                text: expect.stringContaining('contains a dot'),
            },
        ]);
        expect(testFS.existsSync(projectDir.combinePaths('my.module.py'))).toBe(false);
    });

    // --- name validation: warnings (allow but warn) ---

    it('shows warning for name starting with digit', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), '123invalid']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('starts with a digit'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
        expect(testFS.existsSync(projectDir.combinePaths('123invalid.py'))).toBe(true);
    });

    it('shows warning for Unicode name', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'módulo']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('non-ASCII'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
        expect(testFS.existsSync(projectDir.combinePaths('módulo.py'))).toBe(true);
    });

    it('shows warning for name with space', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my module']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('not a valid Python identifier'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
        expect(testFS.existsSync(projectDir.combinePaths('my module.py'))).toBe(true);
    });

    // --- edge cases ---

    it('returns early if arguments are insufficient', async () => {
        const args = { command: 'test', arguments: [projectDir.toString()] };

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages.length).toBe(1);
        expect(window.messages[0].type).toBe('error');
    });

    it('shows error if module already exists', async () => {
        testFS.writeFileSync(projectDir.combinePaths('existing.py'), '# already here', 'utf-8');

        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'existing']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('Module "existing" already exists'),
        });
    });

    it('trims leading and trailing whitespace from the name', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), '  mymodule  ']);

        await cmd.execute(args, _mockCancellationToken);

        expect(testFS.existsSync(projectDir.combinePaths('mymodule.py'))).toBe(true);
    });
});

describe('CreatePackageCommand', () => {
    let testFS: TestFileSystem;
    let window: MockWindow;
    let ls: LanguageServerInterface;
    let cmd: CreatePackageCommand;
    let projectDir: Uri;

    beforeEach(() => {
        testFS = new TestFileSystem(false, { cwd: '/' });
        const sp = createServiceProvider(testFS);
        projectDir = Uri.file('/project', sp);
        testFS.mkdirSync(projectDir, { recursive: true });
        window = new MockWindow();
        ls = createMockLanguageServerInterface(testFS, window);
        cmd = new CreatePackageCommand(ls);
    });

    // --- golden path ---

    it('creates a package with __init__.py', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my_package']);

        await cmd.execute(args, _mockCancellationToken);

        const packageDir = projectDir.combinePaths('my_package');
        const initPy = packageDir.combinePaths('__init__.py');
        expect(testFS.statSync(packageDir).isDirectory()).toBe(true);
        expect(testFS.existsSync(initPy)).toBe(true);
        expect(testFS.readFileSync(initPy, 'utf-8')).toBe('');
        expect(window.messages).toEqual([
            { type: 'info', text: expect.stringContaining('Created package "my_package"') },
        ]);
    });

    // --- target directory errors ---

    it('shows error if target directory does not exist', async () => {
        const missingDir = projectDir.combinePaths('nope');
        const args = makeArgs([projectDir.toString(), missingDir.toString(), 'my_package']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('does not exist'),
        });
    });

    it('falls back to parent directory when target is a file', async () => {
        const filePath = projectDir.combinePaths('somefile.py');
        testFS.writeFileSync(filePath, '# content', 'utf-8');

        const args = makeArgs([projectDir.toString(), filePath.toString(), 'new_pkg']);

        await cmd.execute(args, _mockCancellationToken);

        const packageDir = projectDir.combinePaths('new_pkg');
        expect(testFS.existsSync(packageDir)).toBe(true);
        expect(testFS.statSync(packageDir).isDirectory()).toBe(true);
        expect(window.messages[0]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
    });

    // --- name validation: errors (abort creation) ---

    it('shows error for name with NTFS forbidden characters', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'bad:name']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages).toEqual([
            {
                type: 'error',
                text: expect.stringContaining('contains characters that are not allowed in file names'),
            },
        ]);
    });

    it('shows error for name containing a dot', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my.pkg']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages).toEqual([
            {
                type: 'error',
                text: expect.stringContaining('contains a dot'),
            },
        ]);
    });

    // --- name validation: warnings (allow but warn) ---

    it('shows warning for name starting with digit', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), '123pkg']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('starts with a digit'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
    });

    it('shows warning for Unicode name', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'paquéte']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('non-ASCII'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
    });

    it('shows warning for name with space', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'my package']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'warning',
            text: expect.stringContaining('not a valid Python identifier'),
        });
        expect(window.messages[1]).toEqual({
            type: 'info',
            text: expect.stringContaining('Created'),
        });
    });

    // --- edge cases ---

    it('shows error if package already exists', async () => {
        testFS.mkdirSync(projectDir.combinePaths('existing_pkg'), { recursive: true });

        const args = makeArgs([projectDir.toString(), projectDir.toString(), 'existing_pkg']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('Package "existing_pkg" already exists'),
        });
    });

    it('returns early for empty name', async () => {
        const args = makeArgs([projectDir.toString(), projectDir.toString(), '']);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages.length).toBe(0);
    });
});
