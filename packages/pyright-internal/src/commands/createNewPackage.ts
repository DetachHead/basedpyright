import { ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';
import { validateArbitaryModuleNamePart } from '../analyzer/symbolNameUtils';

const Service = Localizer.Service;

export class CreatePackageCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(params: ExecuteCommandParams): Promise<void> {
        if (params.arguments && params.arguments.length >= 1) {
            const docUri = Uri.parse(params.arguments[0] as string, this._ls.serviceProvider);
            const otherArgs = params.arguments.slice(1);
            const workspace = await this._ls.getWorkspaceForFile(docUri);
            if (!otherArgs || otherArgs.length < 2) {
                this._ls.window.showErrorMessage(Service.invalidArgsCreatePackage());
                return;
            }

            let targetDir = Uri.parse(otherArgs[1] as string, this._ls.serviceProvider);

            if (targetDir.isEmpty()) {
                this._ls.window.showErrorMessage(Service.invalidTargetDirectory());
                return;
            }

            const packageName = (otherArgs[2] as string).trim();

            if (!packageName) {
                return;
            }

            const nameCheck = validateArbitaryModuleNamePart(packageName);
            if (nameCheck === 'forbidden') {
                this._ls.window.showErrorMessage(Service.invalidPythonNameForbidden().format({ name: packageName }));
                return;
            }
            if (nameCheck === 'dot') {
                this._ls.window.showErrorMessage(Service.invalidPythonNameDot().format({ name: packageName }));
                return;
            }
            if (nameCheck === 'nonIdentifier') {
                this._ls.window.showWarningMessage(
                    Service.invalidPythonNameNonIdentifier().format({ name: packageName })
                );
            }
            if (nameCheck === 'unicode') {
                this._ls.window.showWarningMessage(Service.invalidPythonNameUnicode().format({ name: packageName }));
            }

            const fs = workspace.service.fs;

            if (!fs.existsSync(targetDir)) {
                this._ls.window.showErrorMessage(
                    Service.dirNotExist().format({ path: targetDir.toUserVisibleString() })
                );
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
}
