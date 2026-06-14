import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { SignatureDisplayType } from '../common/configOptions';
import { LogLevel, NullConsole } from '../common/console';
import { LanguageServerInterface, MessageAction, WindowInterface } from '../common/languageServerInterface';
import { createServiceProvider } from '../common/serviceProviderExtensions';
import { Uri } from '../common/uri/uri';
import { WellKnownWorkspaceKinds, Workspace, createInitStatus } from '../workspaceFactory';
import { ConvertToPackageCommand, ExtractInitFromPackageCommand } from '../commands/convertAndExtract';
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
    showInformationMessage(message: string, ..._actions: MessageAction[]): void | Promise<MessageAction | undefined> {
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

describe('ConvertToPackageCommand', () => {
    let testFS: TestFileSystem;
    let window: MockWindow;
    let ls: LanguageServerInterface;
    let cmd: ConvertToPackageCommand;
    let projectDir: Uri;
    let moduleUri: Uri;

    beforeEach(() => {
        testFS = new TestFileSystem(false, { cwd: '/' });
        const sp = createServiceProvider(testFS);
        projectDir = Uri.file('/project', sp);
        testFS.mkdirSync(projectDir, { recursive: true });
        moduleUri = projectDir.combinePaths('mymodule.py');
        testFS.writeFileSync(moduleUri, '# original content', 'utf-8');
        window = new MockWindow();
        ls = createMockLanguageServerInterface(testFS, window);
        cmd = new ConvertToPackageCommand(ls);
    });

    it('converts module to package with content moved to __init__.py', async () => {
        const args = makeArgs([projectDir.toString(), moduleUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        const packageDir = projectDir.combinePaths('mymodule');
        const initPy = packageDir.combinePaths('__init__.py');

        // Original file removed
        expect(testFS.existsSync(moduleUri)).toBe(false);
        // Package created with content
        expect(testFS.statSync(packageDir).isDirectory()).toBe(true);
        expect(testFS.readFileSync(initPy, 'utf-8')).toBe('# original content');
        expect(window.messages[0].type).toBe('info');
        expect(window.messages[0].text).toContain('mymodule');
    });

    it('shows error if module does not exist', async () => {
        const missingUri = projectDir.combinePaths('missing.py');
        const args = makeArgs([projectDir.toString(), missingUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('not found'),
        });
    });

    it('shows error if target package directory already exists', async () => {
        const packageDir = projectDir.combinePaths('mymodule');
        testFS.mkdirSync(packageDir, { recursive: true });

        const args = makeArgs([projectDir.toString(), moduleUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining("'mymodule/' already exists"),
        });
        // Original file untouched
        expect(testFS.existsSync(moduleUri)).toBe(true);
    });

    it('rejects .pyi stub files', async () => {
        const stubUri = projectDir.combinePaths('stubmod.pyi');
        testFS.writeFileSync(stubUri, '# stub', 'utf-8');

        const args = makeArgs([projectDir.toString(), stubUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('Cannot convert stub file'),
        });
    });

    it('rejects __init__.py', async () => {
        const initUri = projectDir.combinePaths('foo', '__init__.py');
        testFS.mkdirSync(projectDir.combinePaths('foo'), { recursive: true });
        testFS.writeFileSync(initUri, '# init', 'utf-8');

        const args = makeArgs([projectDir.toString(), initUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('Cannot convert'),
        });
    });

    it('rejects __main__.py', async () => {
        const mainUri = projectDir.combinePaths('__main__.py');
        testFS.writeFileSync(mainUri, '# main', 'utf-8');

        const args = makeArgs([projectDir.toString(), mainUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('Cannot convert'),
        });
    });

    it('rejects non-.py files', async () => {
        const txtUri = projectDir.combinePaths('readme.txt');
        testFS.writeFileSync(txtUri, 'hello', 'utf-8');

        const args = makeArgs([projectDir.toString(), txtUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('is not a Python module file'),
        });
    });
});

describe('ExtractInitFromPackageCommand', () => {
    let testFS: TestFileSystem;
    let window: MockWindow;
    let ls: LanguageServerInterface;
    let cmd: ExtractInitFromPackageCommand;
    let projectDir: Uri;
    let initUri: Uri;

    beforeEach(() => {
        testFS = new TestFileSystem(false, { cwd: '/' });
        const sp = createServiceProvider(testFS);
        projectDir = Uri.file('/project', sp);
        const packageDir = projectDir.combinePaths('mypkg');
        testFS.mkdirSync(packageDir, { recursive: true });
        initUri = packageDir.combinePaths('__init__.py');
        testFS.writeFileSync(initUri, '# init content\nfrom .sub import *\n', 'utf-8');
        window = new MockWindow();
        ls = createMockLanguageServerInterface(testFS, window);
        cmd = new ExtractInitFromPackageCommand(ls);
    });

    it('extracts init content to sibling module and removes old package', async () => {
        const args = makeArgs([projectDir.toString(), initUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        const moduleUri = projectDir.combinePaths('mypkg.py');
        const packageDir = projectDir.combinePaths('mypkg');

        expect(testFS.existsSync(moduleUri)).toBe(true);
        expect(testFS.readFileSync(moduleUri, 'utf-8')).toBe('# init content\nfrom .sub import *\n');
        // Old __init__.py removed
        expect(testFS.existsSync(initUri)).toBe(false);
        // Empty package directory removed
        expect(testFS.existsSync(packageDir)).toBe(false);
        expect(window.messages[0]).toEqual({
            type: 'info',
            text: expect.stringContaining("Extracted '__init__.py' content to 'mypkg' module"),
        });
    });

    it('preserves package directory when it contains other files', async () => {
        const packageDir = projectDir.combinePaths('mypkg');
        const otherFile = packageDir.combinePaths('other.py');
        testFS.writeFileSync(otherFile, '# other', 'utf-8');

        const args = makeArgs([projectDir.toString(), initUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        const moduleUri = projectDir.combinePaths('mypkg.py');
        // Module created
        expect(testFS.existsSync(moduleUri)).toBe(true);
        // __init__.py removed
        expect(testFS.existsSync(initUri)).toBe(false);
        // Package directory preserved (has other files)
        expect(testFS.existsSync(packageDir)).toBe(true);
        expect(testFS.existsSync(otherFile)).toBe(true);
    });

    it('shows error if __init__.py does not exist', async () => {
        const missingInit = projectDir.combinePaths('missing', '__init__.py');
        const args = makeArgs([projectDir.toString(), missingInit.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining('not found'),
        });
    });

    it('shows error if target module already exists', async () => {
        const existingPy = projectDir.combinePaths('mypkg.py');
        testFS.writeFileSync(existingPy, '# existing', 'utf-8');

        const args = makeArgs([projectDir.toString(), initUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining("Module 'mypkg' already exists"),
        });
    });

    it('rejects file that is not __init__.py', async () => {
        const otherUri = projectDir.combinePaths('mypkg', 'other.py');
        testFS.writeFileSync(otherUri, '# other', 'utf-8');

        const args = makeArgs([projectDir.toString(), otherUri.toString()]);

        await cmd.execute(args, _mockCancellationToken);

        expect(window.messages[0]).toEqual({
            type: 'error',
            text: expect.stringContaining("Expected '__init__.py'"),
        });
    });
});
