import { ExecuteCommandParams } from 'vscode-languageserver';
import { CreateModuleCommand } from '../commands/createNewModule';
import { setLocaleOverride } from '../localization/localize';
import { TestLanguageService } from './harness/fourslash/testLanguageService';
import { parseAndGetTestState, TestState } from './harness/fourslash/testState';

// message reports from LSP uses system locale settings.
// TODO: other test files should also be fixed.
setLocaleOverride('en-us');

function makeArgs(args: (string | undefined)[]): ExecuteCommandParams {
    return { command: 'test.command', arguments: args };
}

describe('CreateModuleCommand', () => {
    let state: TestState;
    let ls: TestLanguageService;
    let cmd: CreateModuleCommand;

    beforeEach(() => {
        state = parseAndGetTestState('').state;
        ls = new TestLanguageService(state.workspace, state.console, state.workspace.service.fs);
        cmd = new CreateModuleCommand(ls);
    });

    function root() {
        return state.workspace.rootUri!;
    }
    function fs() {
        return state.workspace.service.fs;
    }

    it('creates a module file in the target directory', async () => {
        await cmd.execute(makeArgs([root().toString(), root().toString(), 'my_module']));
        expect(fs().existsSync(root().combinePaths('my_module.py'))).toBe(true);
    });

    it('strips .py extension from the input name', async () => {
        await cmd.execute(makeArgs([root().toString(), root().toString(), 'my_module.py']));
        expect(fs().existsSync(root().combinePaths('my_module.py'))).toBe(true);
    });

    it('trims whitespace from the name', async () => {
        await cmd.execute(makeArgs([root().toString(), root().toString(), '  mymodule  ']));
        expect(fs().existsSync(root().combinePaths('mymodule.py'))).toBe(true);
    });

    it('falls back to parent directory when target is a file', async () => {
        const fp = root().combinePaths('somefile.py');
        fs().writeFileSync(fp, '# content', 'utf-8');
        await cmd.execute(makeArgs([root().toString(), fp.toString(), 'new_module']));
        expect(fs().existsSync(root().combinePaths('new_module.py'))).toBe(true);
    });

    it('fails if module already exists', async () => {
        fs().writeFileSync(root().combinePaths('dup.py'), '# dup', 'utf-8');
        await expect(cmd.execute(makeArgs([root().toString(), root().toString(), 'dup']))).rejects.toThrow();
    });

    it('fails if target directory does not exist', async () => {
        await expect(
            cmd.execute(makeArgs([root().toString(), root().combinePaths('nope').toString(), 'm']))
        ).rejects.toThrow();
    });

    it('fails for name with NTFS forbidden characters', async () => {
        await expect(cmd.execute(makeArgs([root().toString(), root().toString(), 'bad:name']))).rejects.toThrow();
    });

    it('fails for name containing a dot', async () => {
        await expect(cmd.execute(makeArgs([root().toString(), root().toString(), 'my.module']))).rejects.toThrow();
    });
});
