import type { Dirent, ReadStream, StatsBase, WriteStream } from 'fs';
import { FileSystem, MkDirOptions, Stats } from './fileSystem';
import { FilePermission, FileStat, FileType, workspace, Uri as VscodeUri } from 'vscode';
import { FileWatcherEventHandler, FileWatcher } from './fileWatcher';
import { Uri } from './uri/uri';
import { Readable, Stream } from 'stream';
import { UriEx } from './uri/uriUtils';

export class VscodeStats implements Stats {
    mode: number;
    size: number;
    blocks: number;
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
    blksize = 4096;
    constructor(private _fileStat: FileStat) {
        this.ctime = new Date(_fileStat.ctime);
        this.mtime = new Date(_fileStat.mtime);
        this.ctimeMs = _fileStat.ctime;
        this.mtimeMs = _fileStat.mtime;
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

// export class Dirent {
//     constructor(public name: string, private _fileType: FileType) {}
//     isFile = () => this._fileType === FileType.File;
//     isDirectory = () => this._fileType === FileType.Directory;
//     isSymbolicLink = () => this._fileType === FileType.SymbolicLink;
//     isBlockDevice = () => false;
//     isCharacterDevice = () => false;
//     isFIFO = () => false;
//     isSocket = () => false;
// }

const toVscodeUri = (uri: Uri) => VscodeUri.parse(uri.toString());

class VscodeFsReadStream extends Stream.Readable implements ReadStream {
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

class VscodeWebFileSystem implements FileSystem {
    mkdir = (uri: Uri, options?: MkDirOptions | undefined) => workspace.fs.createDirectory(toVscodeUri(uri));
    writeFile = (uri: Uri, data: string | Buffer, encoding: BufferEncoding | null) =>
        workspace.fs.writeFile(
            toVscodeUri(uri),
            typeof data === 'string' ? Buffer.from(data, encoding ?? 'utf8') : data
        );
    unlink = (uri: Uri) => workspace.fs.delete(toVscodeUri(uri));
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
        const stream = new VscodeFsReadStream(uri.toString());
        void workspace.fs.readFile(toVscodeUri(uri)).then((result) => stream.push(result));
        return stream;
    };
    createWriteStream = (uri: Uri) => new VsCodeFsWriteStream(uri.toString());
    copyFile = (uri: Uri, dst: Uri) => workspace.fs.copy(toVscodeUri(uri), toVscodeUri(dst));
    exists = async (uri: Uri) => {
        try {
            await this.stat(uri);
            return true;
        } catch {
            return false;
        }
    };
    chdir(uri: Uri): void {
        throw new Error('Method not implemented.');
    }
    readdirEntriesSync(uri: Uri): Dirent[] {
        throw new Error('Method not implemented.');
    }
    readdirSync(uri: Uri): string[] {
        throw new Error('Method not implemented.');
    }
    stat = async (uri: Uri) => new VscodeStats(await workspace.fs.stat(toVscodeUri(uri)));
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
    readFile = async (uri: Uri) => Buffer.from(await workspace.fs.readFile(toVscodeUri(uri)));
    readFileText(uri: Uri, encoding?: BufferEncoding | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    realCasePath(uri: Uri): Uri {
        throw new Error('Method not implemented.');
    }
    isMappedUri(uri: Uri): boolean {
        throw new Error('Method not implemented.');
    }
    getOriginalUri(mappedUri: Uri): Uri {
        throw new Error('Method not implemented.');
    }
    getMappedUri(originalUri: Uri): Uri {
        throw new Error('Method not implemented.');
    }
    isInZip(uri: Uri): boolean {
        throw new Error('Method not implemented.');
    }
}
