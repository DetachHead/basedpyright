import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser';
import { PyrightServer } from './browser-server';

// @ts-ignore
const ctx: Worker = self as any;

const createLanguageServer = new PyrightServer(
    createConnection(new BrowserMessageReader(ctx), new BrowserMessageWriter(ctx))
);

export default createLanguageServer;
