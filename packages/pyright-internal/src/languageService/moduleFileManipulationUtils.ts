import { validateArbitaryModuleNamePart } from '../analyzer/symbolNameUtils';
import { FileSystem } from '../common/fileSystem';
import { LanguageServerInterface } from '../common/languageServerInterface';
import { Uri } from '../common/uri/uri';
import { Localizer } from '../localization/localize';

const Service = Localizer.Service;

export function checkModuleOrPackageNameAndTarget(
    fs: FileSystem,
    ls: LanguageServerInterface,
    targetDir: Uri,
    name: string
) {
    const nameCheck = validateArbitaryModuleNamePart(name);
    if (nameCheck === 'forbidden') {
        ls.window.showErrorMessage(Service.invalidPythonNameForbidden().format({ name: name }));
        return;
    }
    if (nameCheck === 'dot') {
        ls.window.showErrorMessage(Service.invalidPythonNameDot().format({ name: name }));
        return;
    }
    if (nameCheck === 'nonIdentifier') {
        ls.window.showWarningMessage(Service.invalidPythonNameNonIdentifier().format({ name: name }));
    }
    if (nameCheck === 'unicode') {
        ls.window.showWarningMessage(Service.invalidPythonNameUnicode().format({ name: name }));
    }

    if (!fs.existsSync(targetDir)) {
        ls.window.showErrorMessage(Service.dirNotExist().format({ path: targetDir.toUserVisibleString() }));
        return;
    }
    // If the target is a file (e.g. from command palette), use its parent directory
    if (!fs.statSync(targetDir).isDirectory()) {
        targetDir = targetDir.getDirectory();
    }

    return targetDir;
}
