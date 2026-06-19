import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';

const Service = Localizer.Service;

export type NameValidation = 'ok' | 'forbidden' | 'nonIdentifier' | 'dot' | 'leadingDigit' | 'unicode';

export function hasForbiddenFileNameChars(name: string): boolean {
    for (const ch of name) {
        const code = ch.charCodeAt(0);
        if (code < 0x20 || code === 0x7f) {
            return true;
        }
        if (
            ch === '<' ||
            ch === '>' ||
            ch === ':' ||
            ch === '"' ||
            ch === '/' ||
            ch === '\\' ||
            ch === '|' ||
            ch === '?' ||
            ch === '*'
        ) {
            return true;
        }
    }
    return false;
}

function hasNonAsciiChars(name: string): boolean {
    for (const ch of name) {
        if (ch.charCodeAt(0) > 127) {
            return true;
        }
    }
    return false;
}

export function validatePythonName(name: string): NameValidation {
    if (!name) {
        return 'nonIdentifier';
    }
    if (hasForbiddenFileNameChars(name)) {
        return 'forbidden';
    }
    // Leading digit: valid as a filename but not importable via `import` statement.
    // Can still be loaded via importlib.import_module(), so warn rather than error.
    if (/^\d/.test(name)) {
        return 'leadingDigit';
    }
    // Pure-ASCII Python identifier
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        return 'ok';
    }
    // Dot: always conflicts with Python's package-path resolution.
    // A file named `foo.bar.py` can never be imported — `import foo.bar`
    // looks for `foo/bar.py`, not `foo.bar.py`.
    if (name.includes('.')) {
        return 'dot';
    }
    // Non-ASCII: could be valid PEP 3131 identifier, but warn about portability
    if (hasNonAsciiChars(name)) {
        return 'unicode';
    }
    return 'nonIdentifier';
}

function tryParseUri(str: string | undefined, ls: LanguageServerInterface): Uri | undefined {
    if (!str) {
        return undefined;
    }
    const uri = Uri.parse(str, ls.serviceProvider);
    return uri.isEmpty() ? undefined : uri;
}

async function resolveWorkspace(
    ls: LanguageServerInterface,
    primaryUri: Uri | undefined,
    fallbackUri: Uri | undefined
) {
    for (const uri of [primaryUri, fallbackUri]) {
        if (uri) {
            const workspace = await ls.getWorkspaceForFile(uri);
            if (workspace) {
                return workspace;
            }
        }
    }
    return undefined;
}

export class CreateModuleCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(cmdParams: ExecuteCommandParams, _token: CancellationToken): Promise<any> {
        const args = cmdParams.arguments;
        if (!args || args.length < 3) {
            this._ls.window.showErrorMessage(Service.invalidArgsCreateModule());
            return;
        }

        let targetDir = tryParseUri(args[1] as string, this._ls);
        let moduleName = (args[2] as string).trim();

        if (!targetDir) {
            this._ls.window.showErrorMessage(Service.invalidTargetDirectory());
            return;
        }

        // Strip .py extension if user typed it
        if (moduleName.endsWith('.py') && moduleName.length > 3) {
            moduleName = moduleName.slice(0, -3);
        }

        if (!moduleName) {
            return;
        }

        const nameCheck = validatePythonName(moduleName);
        if (nameCheck === 'forbidden') {
            this._ls.window.showErrorMessage(
                Service.invalidPythonNameForbidden().format({ name: moduleName })
            );
            return;
        }
        if (nameCheck === 'dot') {
            this._ls.window.showErrorMessage(
                Service.invalidPythonNameDot().format({ name: moduleName })
            );
            return;
        }
        if (nameCheck === 'nonIdentifier') {
            this._ls.window.showWarningMessage(
                Service.invalidPythonNameNonIdentifier().format({ name: moduleName })
            );
        }
        if (nameCheck === 'leadingDigit') {
            this._ls.window.showWarningMessage(Service.invalidPythonNameLeadingDigit().format({ name: moduleName }));
        }
        if (nameCheck === 'unicode') {
            this._ls.window.showWarningMessage(Service.invalidPythonNameUnicode().format({ name: moduleName }));
        }

        const workspaceUri = tryParseUri(args[0] as string | undefined, this._ls);
        const workspace = await resolveWorkspace(this._ls, workspaceUri, targetDir);
        if (!workspace) {
            this._ls.window.showErrorMessage(Service.noWorkspaceFound());
            return;
        }

        const fs = workspace.service.fs;

        if (!fs.existsSync(targetDir)) {
            this._ls.window.showErrorMessage(Service.dirNotExist().format({ path: targetDir.toUserVisibleString() }));
            return;
        }
        // If the target is a file (e.g. from command palette), use its parent directory
        if (!fs.statSync(targetDir).isDirectory()) {
            targetDir = targetDir.getDirectory();
        }

        const moduleUri = targetDir.combinePaths(moduleName + '.py');

        if (fs.existsSync(moduleUri)) {
            this._ls.window.showErrorMessage(Service.moduleAlreadyExists().format({ name: moduleName }));
            return;
        }

        fs.writeFileSync(moduleUri, '', 'utf-8');
        this._ls.window.showInformationMessage(Service.moduleCreated().format({ name: moduleName + '.py' }));
    }
}

export class CreatePackageCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(cmdParams: ExecuteCommandParams, _token: CancellationToken): Promise<any> {
        const args = cmdParams.arguments;
        if (!args || args.length < 3) {
            this._ls.window.showErrorMessage(Service.invalidArgsCreatePackage());
            return;
        }

        let targetDir = tryParseUri(args[1] as string, this._ls);
        const packageName = (args[2] as string).trim();

        if (!targetDir) {
            this._ls.window.showErrorMessage(Service.invalidTargetDirectory());
            return;
        }

        if (!packageName) {
            return;
        }

        const nameCheck = validatePythonName(packageName);
        if (nameCheck === 'forbidden') {
            this._ls.window.showErrorMessage(
                Service.invalidPythonNameForbidden().format({ name: packageName })
            );
            return;
        }
        if (nameCheck === 'dot') {
            this._ls.window.showErrorMessage(
                Service.invalidPythonNameDot().format({ name: packageName })
            );
            return;
        }
        if (nameCheck === 'nonIdentifier') {
            this._ls.window.showWarningMessage(
                Service.invalidPythonNameNonIdentifier().format({ name: packageName })
            );
        }
        if (nameCheck === 'leadingDigit') {
            this._ls.window.showWarningMessage(Service.invalidPythonNameLeadingDigit().format({ name: packageName }));
        }
        if (nameCheck === 'unicode') {
            this._ls.window.showWarningMessage(Service.invalidPythonNameUnicode().format({ name: packageName }));
        }

        const workspaceUri = tryParseUri(args[0] as string | undefined, this._ls);
        const workspace = await resolveWorkspace(this._ls, workspaceUri, targetDir);
        if (!workspace) {
            this._ls.window.showErrorMessage(Service.noWorkspaceFound());
            return;
        }

        const fs = workspace.service.fs;

        if (!fs.existsSync(targetDir)) {
            this._ls.window.showErrorMessage(Service.dirNotExist().format({ path: targetDir.toUserVisibleString() }));
            return;
        }
        // If the target is a file (e.g. from command palette), use its parent directory
        if (!fs.statSync(targetDir).isDirectory()) {
            targetDir = targetDir.getDirectory();
        }

        const packageDir = targetDir.combinePaths(packageName);
        const initPy = packageDir.combinePaths('__init__.py');

        if (fs.existsSync(packageDir)) {
            this._ls.window.showErrorMessage(Service.packageAlreadyExists().format({ name: packageName }));
            return;
        }

        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(initPy, '', 'utf-8');
        this._ls.window.showInformationMessage(Service.packageCreated().format({ name: packageName }));
    }
}
