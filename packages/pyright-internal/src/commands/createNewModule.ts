import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';
import { checkModuleOrPackageNameAndTarget } from '../languageService/moduleFileManipulationUtils';

const Service = Localizer.Service;

export class CreateModuleCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(params: ExecuteCommandParams, token: CancellationToken): Promise<void> {
        if (params.arguments && params.arguments.length >= 1) {
            const docUri = Uri.parse(params.arguments[0] as string, this._ls.serviceProvider);
            const otherArgs = params.arguments.slice(1);
            const workspace = await this._ls.getWorkspaceForFile(docUri);
            if (!otherArgs || otherArgs.length < 2) {
                this._ls.window.showErrorMessage(Service.invalidArgsCreateModule());
                return;
            }

            const targetDir = Uri.parse(otherArgs[0] as string, this._ls.serviceProvider);

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

            const fs = workspace.service.fs;

            const checkedTargetDir = checkModuleOrPackageNameAndTarget(fs, this._ls, targetDir, moduleName);
            if (!checkedTargetDir) {
                return;
            }

            const moduleUri = checkedTargetDir.combinePaths(moduleName + '.py');

            if (fs.existsSync(moduleUri)) {
                this._ls.window.showErrorMessage(Service.moduleAlreadyExists().format({ name: moduleName }));
                return;
            }

            fs.writeFileSync(moduleUri, '', 'utf-8'); // not sure how to use workspace edits properly
            this._ls.window.showInformationMessage(Service.moduleCreated().format({ name: moduleName + '.py' }));
        }
    }
}
