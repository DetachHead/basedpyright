import { ExecuteCommandParams } from 'vscode-languageserver';
import { ServerCommand } from './commandController';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';
import { checkModuleOrPackageNameAndTarget } from '../languageService/moduleFileManipulationUtils';

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

            const targetDir = Uri.parse(otherArgs[0] as string, this._ls.serviceProvider);

            if (targetDir.isEmpty()) {
                this._ls.window.showErrorMessage(Service.invalidTargetDirectory());
                return;
            }

            const packageName = (otherArgs[1] as string).trim();

            if (!packageName) {
                return;
            }

            const fs = workspace.service.fs;

            const checkedTargetDir = checkModuleOrPackageNameAndTarget(fs, this._ls, targetDir, packageName);
            if (!checkedTargetDir) {
                return;
            }

            const packageDir = checkedTargetDir.combinePaths(packageName);
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
