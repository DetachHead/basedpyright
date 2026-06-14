import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';

const Service = Localizer.Service;

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

export class ConvertToPackageCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(cmdParams: ExecuteCommandParams, _token: CancellationToken): Promise<any> {
        const args = cmdParams.arguments;
        if (!args || args.length < 2) {
            this._ls.window.showErrorMessage(Service.invalidArgsConvertToPackage());
            return;
        }

        const moduleUri = tryParseUri(args[1] as string, this._ls);

        if (!moduleUri) {
            this._ls.window.showErrorMessage(Service.invalidModuleUri());
            return;
        }

        if (moduleUri.hasExtension('.pyi')) {
            this._ls.window.showErrorMessage(
                Service.cannotConvertStub().format({ name: moduleUri.fileName })
            );
            return;
        }

        if (!moduleUri.hasExtension('.py')) {
            this._ls.window.showErrorMessage(
                Service.notPythonModule().format({ name: moduleUri.fileName })
            );
            return;
        }

        const moduleFileName = moduleUri.fileName;
        if (moduleFileName === '__init__.py' || moduleFileName === '__main__.py') {
            this._ls.window.showErrorMessage(
                Service.cannotConvertSpecial().format({ name: moduleFileName })
            );
            return;
        }

        const workspaceUri = tryParseUri(args[0] as string | undefined, this._ls);
        const workspace = await resolveWorkspace(this._ls, workspaceUri, moduleUri);
        if (!workspace) {
            this._ls.window.showErrorMessage(Service.noWorkspaceFound());
            return;
        }

        const fs = workspace.service.fs;

        if (!fs.existsSync(moduleUri)) {
            this._ls.window.showErrorMessage(
                Service.moduleNotFound().format({ name: moduleUri.fileName })
            );
            return;
        }

        const parentDir = moduleUri.getDirectory();
        const moduleName = moduleUri.fileNameWithoutExtensions;
        const packageDir = parentDir.combinePaths(moduleName);
        const initPy = packageDir.combinePaths('__init__.py');

        if (fs.existsSync(packageDir)) {
            this._ls.window.showErrorMessage(
                Service.cannotConvertPackageExists().format({ name: moduleName })
            );
            return;
        }

        const moduleContent = fs.readFileSync(moduleUri, 'utf-8') as string;

        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(initPy, moduleContent, 'utf-8');
        fs.unlinkSync(moduleUri);

        this._ls.window.showInformationMessage(
            Service.moduleConverted().format({ name: moduleName })
        );
    }
}

export class ExtractInitFromPackageCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(cmdParams: ExecuteCommandParams, _token: CancellationToken): Promise<any> {
        const args = cmdParams.arguments;
        if (!args || args.length < 2) {
            this._ls.window.showErrorMessage(Service.invalidArgsExtractFromPackage());
            return;
        }

        const initUri = tryParseUri(args[1] as string, this._ls);

        if (!initUri) {
            this._ls.window.showErrorMessage(Service.invalidInitPyUri());
            return;
        }

        if (initUri.fileName !== '__init__.py') {
            this._ls.window.showErrorMessage(
                Service.notInitPy().format({ name: initUri.fileName })
            );
            return;
        }

        const workspaceUri = tryParseUri(args[0] as string | undefined, this._ls);
        const workspace = await resolveWorkspace(this._ls, workspaceUri, initUri);
        if (!workspace) {
            this._ls.window.showErrorMessage(Service.noWorkspaceFound());
            return;
        }

        const fs = workspace.service.fs;

        if (!fs.existsSync(initUri)) {
            this._ls.window.showErrorMessage(
                Service.initPyNotFound().format({ path: initUri.toUserVisibleString() })
            );
            return;
        }

        const packageDir = initUri.getDirectory();
        const packageName = packageDir.fileName;
        const parentDir = packageDir.getDirectory();

        if (!packageName || packageDir.equals(parentDir)) {
            this._ls.window.showErrorMessage(
                Service.cannotDeterminePackageName().format({
                    path: initUri.toUserVisibleString(),
                })
            );
            return;
        }

        const moduleUri = parentDir.combinePaths(packageName + '.py');

        if (fs.existsSync(moduleUri)) {
            this._ls.window.showErrorMessage(
                Service.moduleAlreadyExists().format({ name: packageName })
            );
            return;
        }

        const initContent = fs.readFileSync(initUri, 'utf-8') as string;

        fs.writeFileSync(moduleUri, initContent, 'utf-8');
        fs.unlinkSync(initUri);

        // Remove the package directory if it's now empty
        try {
            const entries = fs.readdirSync(packageDir);
            if (entries.length === 0) {
                fs.rmdirSync(packageDir);
            }
        } catch {
            // Directory may have other files — leave it in place
        }

        this._ls.window.showInformationMessage(
            Service.initExtracted().format({ name: packageName })
        );
    }
}
