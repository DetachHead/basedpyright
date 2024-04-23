import type { Dirent, ReadStream, WriteStream } from 'fs';
import { FileSystem, MkDirOptions, Stats } from './fileSystem';
import { FilePermission, FileStat, FileType, workspace, Uri as VsCodeUri } from 'vscode';
import { FileWatcherEventHandler, FileWatcher } from './fileWatcher';
import { Uri } from './uri/uri';
import { Stream } from 'stream';
import path from 'path';

export class VsCodeStats implements Stats {
    mode: number;
    size: number;
    atimeMs: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    birthtime: Date;
    ino = 0;
    dev = 0;
    nlink = 0;
    uid = 0;
    gid = 0;
    rdev = 0;
    blocks = 0;
    blksize = 4096;
    constructor(private _fileStat: FileStat) {
        this.ctimeMs = _fileStat.ctime;
        this.mtimeMs = _fileStat.mtime;
        this.atimeMs = this.mtimeMs;
        this.birthtimeMs = this.ctimeMs;
        this.ctime = new Date(this.ctimeMs);
        this.mtime = new Date(this.mtimeMs);
        this.atime = new Date(this.atimeMs);
        this.birthtime = new Date(this.birthtimeMs);
        this.size = _fileStat.size;
        if (_fileStat.permissions === FilePermission.Readonly) {
            this.mode = 16676;
        } else {
            // TODO: wtf is this shit. vscode types say it can only be readonly but the docs imply there are others.
            // in node its even more skitz. https://www.martin-brennan.com/nodejs-file-permissions-fstat/
            throw new Error(`unknown permission: ${_fileStat.permissions}`);
        }

        // all of these, as far as i can tell, arent relevant in the web so we give them fake values:
    }
    isFile = () => this._fileStat.type === FileType.File;
    isDirectory = () => this._fileStat.type === FileType.Directory;
    isBlockDevice = () => false;
    isCharacterDevice = () => false;
    isFIFO = () => false;
    isSocket = () => false;
    isSymbolicLink = () => false;
}

class VsCodeFsReadStream extends Stream.Readable implements ReadStream {
    bytesRead = 0;
    pending = true;
    constructor(public path: string | Buffer) {
        super();
        this.on('ready', () => {
            this.pending = false;
        });
    }
    close = () => this.destroy();
    override read(size?: number) {
        const result = super.read(size);
        this.bytesRead += size ?? result.length;
        return result;
    }
}
type TypedArray =
    | Uint8Array
    | Uint8ClampedArray
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array
    | BigUint64Array
    | BigInt64Array
    | Float32Array
    | Float64Array;
type ArrayBufferView = TypedArray | DataView;

class VsCodeFsWriteStream extends Stream.Writable implements WriteStream {
    bytesWritten = 0;
    pending = true;
    constructor(public path: string | Buffer) {
        super();
        this.on('ready', () => {
            this.pending = false;
        });
    }
    close = (cb?: () => void) => this.end(cb);
    override write(chunk: any, callback?: ((error: Error | null | undefined) => void) | undefined): boolean;
    override write(
        chunk: any,
        encoding: BufferEncoding,
        callback?: ((error: Error | null | undefined) => void) | undefined
    ): boolean;
    override write(chunk: ArrayBufferView, encoding?: unknown, callback?: unknown): boolean {
        // @ts-expect-error overload moment
        const result = super.write(chunk, encoding, callback);
        this.bytesWritten += chunk instanceof DataView ? chunk.byteLength : chunk.length;
        return result;
    }
}

class VsCodeDirent implements Dirent {
    constructor(public name: string, private _fileType: FileType) {}
    isFile = () => this._fileType === FileType.File;
    isDirectory = () => this._fileType === FileType.Directory;
    isSymbolicLink = () => this._fileType === FileType.SymbolicLink;
    isBlockDevice = () => false;
    isCharacterDevice = () => false;
    isFIFO = () => false;
    isSocket = () => false;
}

class VscodeWebFileSystem implements FileSystem {
    private _workingDirectory = '.';
    mkdir = (uri: Uri) => workspace.fs.createDirectory(this._toVscodeUri(uri));
    writeFile = (uri: Uri, data: string | Buffer, encoding: BufferEncoding | null) =>
        workspace.fs.writeFile(
            this._toVscodeUri(uri),
            typeof data === 'string' ? Buffer.from(data, encoding ?? 'utf8') : data
        );
    unlink = (uri: Uri) => workspace.fs.delete(this._toVscodeUri(uri));
    rmdirSync = (uri: Uri) =>
        // unlink works on both files and directories
        this.unlink(uri);
    createFileSystemWatcher(uris: Uri[], listener: FileWatcherEventHandler): FileWatcher {
        const watcher = workspace.createFileSystemWatcher('{' + uris.map((uri) => uri.toString()).join() + '}');
        watcher.onDidChange((uri) => listener('change', uri.toString()));
        watcher.onDidCreate(async (uri) =>
            listener((await workspace.fs.stat(uri)).type === FileType.Directory ? 'addDir' : 'add', uri.toString())
        );
        watcher.onDidDelete(async (uri) =>
            listener(
                (await workspace.fs.stat(uri)).type === FileType.Directory ? 'unlinkDir' : 'unlink',
                uri.toString()
            )
        );
        return {
            close: watcher.dispose,
        };
    }
    createReadStream = (uri: Uri): ReadStream => {
        const stream = new VsCodeFsReadStream(uri.toString());
        void workspace.fs.readFile(this._toVscodeUri(uri)).then((result) => stream.push(result));
        return stream;
    };
    createWriteStream = (uri: Uri) => new VsCodeFsWriteStream(uri.toString());
    copyFile = (uri: Uri, dst: Uri) => workspace.fs.copy(this._toVscodeUri(uri), this._toVscodeUri(dst));
    exists = async (uri: Uri) => {
        try {
            await this.stat(uri);
            return true;
        } catch {
            return false;
        }
    };
    chdir(uri: Uri): void {
        this._workingDirectory = uri.toString();
    }
    readdirEntries = async (uri: Uri) =>
        (await workspace.fs.readDirectory(this._toVscodeUri(uri))).map(
            ([name, FileType]) => new VsCodeDirent(name, FileType)
        );
    readdir = async (uri: Uri) => (await workspace.fs.readDirectory(this._toVscodeUri(uri))).map(([name]) => name);
    stat = async (uri: Uri) => new VsCodeStats(await workspace.fs.stat(this._toVscodeUri(uri)));
    realpathSync = (uri: Uri) => {
        try {
            return Uri.file(this.stat(uri).toString(), {
                isCaseSensitive: () => true,
            });
        } catch {
            return uri;
        }
    };
    getModulePath = () => Uri.empty();
    readFile = async (uri: Uri) => Buffer.from(await workspace.fs.readFile(this._toVscodeUri(uri)));
    readFileText = async (uri: Uri, encoding?: BufferEncoding | undefined) =>
        (await this.readFile(uri)).toString(encoding);
    realCasePath = (uri: Uri) => this.realpathSync(uri);
    isMappedUri = () => false;
    getOriginalUri = (uri: Uri) => uri;
    getMappedUri = (uri: Uri) => uri;
    isInZip = () => false;
    private _toVscodeUri = (uri: Uri) => VsCodeUri.parse(path.join(this._workingDirectory, uri.toString()));
}
