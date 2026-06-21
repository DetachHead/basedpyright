import { ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';
import { validateArbitaryModuleNamePart } from '../analyzer/symbolNameUtils';

const Service = Localizer.Service;

export class CreateModuleCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(params: ExecuteCommandParams): Promise<void> {
        if (params.arguments && params.arguments.length >= 1) {
            const docUri = Uri.parse(params.arguments[0] as string, this._ls.serviceProvider);
            const otherArgs = params.arguments.slice(1);
            const workspace = await this._ls.getWorkspaceForFile(docUri);
            if (!otherArgs || otherArgs.length < 2) {
                this._ls.window.showErrorMessage(Service.invalidArgsCreateModule());
                return;
            }

            let targetDir = Uri.parse(otherArgs[0] as string, this._ls.serviceProvider);

            if (targetDir.isEmpty()) {
                this._ls.window.showErrorMessage(Service.invalidTargetDirectory());
                return;
            }

            let moduleName = (otherArgs[1] as string).trim();

            // Strip .py extension if user typed it
            if (moduleName.endsWith('.py') && moduleName.length > 3) {
                moduleName = moduleName.slice(0, -3);
            }

            if (!moduleName) {
                return;
            }

            const nameCheck = validateArbitaryModuleNamePart(moduleName);
            if (nameCheck === 'forbidden') {
                this._ls.window.showErrorMessage(Service.invalidPythonNameForbidden().format({ name: moduleName }));
                return;
            }
            if (nameCheck === 'dot') {
                this._ls.window.showErrorMessage(Service.invalidPythonNameDot().format({ name: moduleName }));
                return;
            }
            if (nameCheck === 'nonIdentifier') {
                this._ls.window.showWarningMessage(
                    Service.invalidPythonNameNonIdentifier().format({ name: moduleName })
                );
            }
            if (nameCheck === 'unicode') {
                this._ls.window.showWarningMessage(Service.invalidPythonNameUnicode().format({ name: moduleName }));
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

            const moduleUri = targetDir.combinePaths(moduleName + '.py');

            if (fs.existsSync(moduleUri)) {
                this._ls.window.showErrorMessage(Service.moduleAlreadyExists().format({ name: moduleName }));
                return;
            }

            fs.writeFileSync(moduleUri, '', 'utf-8');
            this._ls.window.showInformationMessage(Service.moduleCreated().format({ name: moduleName + '.py' }));
        }
    }
}
