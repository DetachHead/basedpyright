import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { CreatePackageCommand } from '../commands/createNewPackage';
import { setLocaleOverride } from '../localization/localize';
import { TestLanguageService } from './harness/fourslash/testLanguageService';
import { parseAndGetTestState, TestState } from './harness/fourslash/testState';

// message reports from LSP uses system locale settings.
// TODO: other test files should also be fixed.
setLocaleOverride('en-us');

function makeArgs(args: (string | undefined)[]): ExecuteCommandParams {
    return { command: 'test.command', arguments: args };
}

describe('CreatePackageCommand', () => {
    let state: TestState;
    let ls: TestLanguageService;
    let cmd: CreatePackageCommand;

    beforeEach(() => {
        state = parseAndGetTestState('').state;
        ls = new TestLanguageService(state.workspace, state.console, state.workspace.service.fs);
        cmd = new CreatePackageCommand(ls);
    });

    function root() {
        return state.workspace.rootUri!;
    }
    function fs() {
        return state.workspace.service.fs;
    }

    it('creates a package with __init__.py', async () => {
        await cmd.execute(makeArgs([root().toString(), root().toString(), 'my_package']), CancellationToken.None);

        const pkgDir = root().combinePaths('my_package');
        expect(fs().existsSync(pkgDir)).toBe(true);
        expect(fs().statSync(pkgDir).isDirectory()).toBe(true);
        expect(fs().existsSync(pkgDir.combinePaths('__init__.py'))).toBe(true);
    });

    it('falls back to parent directory when target is a file', async () => {
        const fp = root().combinePaths('somefile.py');
        fs().writeFileSync(fp, '# content', 'utf-8');
        await cmd.execute(makeArgs([root().toString(), fp.toString(), 'new_pkg']), CancellationToken.None);

        const pkgDir = root().combinePaths('new_pkg');
        expect(fs().existsSync(pkgDir)).toBe(true);
        expect(fs().statSync(pkgDir).isDirectory()).toBe(true);
    });

    it('fails if target directory does not exist', async () => {
        await expect(
            cmd.execute(
                makeArgs([root().toString(), root().combinePaths('nope').toString(), 'p']),
                CancellationToken.None
            )
        ).rejects.toThrow();
    });

    it('fails if package already exists', async () => {
        fs().mkdirSync(root().combinePaths('dup'), { recursive: true });
        await expect(
            cmd.execute(makeArgs([root().toString(), root().toString(), 'dup']), CancellationToken.None)
        ).rejects.toThrow();
    });

    it('fails for name with NTFS forbidden characters', async () => {
        await expect(
            cmd.execute(makeArgs([root().toString(), root().toString(), 'bad:name']), CancellationToken.None)
        ).rejects.toThrow();
    });

    it('fails for name containing a dot', async () => {
        await expect(
            cmd.execute(makeArgs([root().toString(), root().toString(), 'my.pkg']), CancellationToken.None)
        ).rejects.toThrow();
    });

    it('returns early for empty name', async () => {
        await cmd.execute(makeArgs([root().toString(), root().toString(), '']), CancellationToken.None);
        // TestWindow only fails on error/warning; empty name returns early without either
    });
});
