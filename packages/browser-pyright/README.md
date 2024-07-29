<h1><img src="https://github.com/DetachHead/basedpyright/assets/57028336/c7342c31-bf23-413c-af6d-bc430898b3dd"> basedpyright (browser edition)</h1>

a version of [basedpyright](https://docs.basedpyright.com) that can be run in a browser.

unless you have a specific reason to use the browser build, it's recommended to install basedpyright from [pypi](https://pypi.org/project/basedpyright/) instead. see [the installation instructions](https://docs.basedpyright.com/#/installation?id=command-line-amp-language-server) for more information.

this build was adapted from the seemingly-abandoned [microbit-foundation pyright fork](https://github.com/microbit-foundation). the information below has been taken from [their documentation](https://github.com/microbit-foundation/pyright/blob/microbit/THIS_FORK.md).

## Changes

The key change is to replace the file system abstraction Pyright uses to read from disk. We took a very simple approach to this, simply swapping in the in-memory test file system class that is used in Pyright's test suite. We then added some custom messages to allow us to manipulate that file system. This whole mechanism might be worth revisiting and comparing against tsserver's solution.

Pyright has a foreground and background thread architecture. They communicate via Node's worker_threads module. We've added an adapter so we can alternatively use the
browser postMessage API. Nested Web Worker support [was only recently added to Safari](https://bugs.webkit.org/show_bug.cgi?id=22723), so there's some extra complexity to allow Pyright to request creation of Workers from the browser main thread. The abstraction should still work in the worker_thread scenario but has not been tested with the VS Code extension or CLI. A closer review of what each thread is responsible for and whether this is the best setup for a web build would be worthwhile — we just focussed on getting it running.

We added an initialization option that allows you to specify the typeshed as a simple JSON object file system. We produce this [from our MicroPython stubs project](https://github.com/microbit-foundation/micropython-microbit-stubs/) as [a JSON file](https://github.com/microbit-foundation/python-editor-v3/blob/main/src/micropython/main/typeshed.en.json). Our stubs project is cut down to the APIs in MicroPython from [Python's typeshed](https://github.com/python/typeshed) so most other users would need to instead use a standard typeshed. The files in the typeshed JSON file are copied to Pyright's file system so they can be discovered by its import resolution. Our set of libraries is fixed so it's feasible for us to provide all stubs up front. I believe TypeScript's language server has support for runtime stub discovery, which might be necessary for a usecase with flexible dependencies. We might need this behaviour in future.

We fixed a syntax error in Safari due to lack of negative look behind support.

Reviewing the changes, [there's a cludge here](https://github.com/microsoft/pyright/compare/main...microbit-foundation:pyright:browser#diff-8a9e7373556006db29659ed8820a21073840a944192d2b49977c032276f1f979R544) that would benefit from further review.

## Limitations

There has been no testing outside of the micro:bit Python Editor scenarios (autocomplete, diagnostics, signature help).

We've not concerned ourselves with supporting multiple workspaces.

Pyright supports a side-channel based cancellation API for background tasks that uses the file system as shared state. We don't support this in the Web Worker. Mitigated for micro:bit by our tiny source code (< 20k in total). A SharedArrayBuffer-based implementation might be practical.

We've also stubbed out memory/cache management that would be relevant to large projects.

There's missing support for some error/exit scenarios (see BrowserMessagePort).

We're rather vulnerable to Pyright changes. Some of these changes are batch merged from the closed Pylance repository which can be hard to follow. We're not particularly worried about keeping up-to-date, as we're targetting MicroPython which is way behind the cutting edge of Python. However, we expect to periodically merge changes. One concern in doing so is that the complexity of Python type checking is growing over time via various typing PEPs resulting in a growth in the Pyright code size. The worker is already very large at 1.3M uncompressed 336K gzipped. Pyright has a monolithic type checking core that makes it hard for us to consider feature / size trade offs.

## Usage

There is no documentation for this beyond example code in the micro:bit Python Editor.

You need to use a language server protocol client library and have a good understanding of the protocol and your responsibilities as a client, especially if your environment works with multiple files. Consider existing implementations for your text editing component. The micro:bit Python Editor uses a custom language server implementation for CodeMirror 6 that is incomplete relative to third-party options.

You need [an initialization dance](https://github.com/microbit-foundation/python-editor-v3/blob/main/src/language-server/pyright.ts) for the Pyright Web Worker due to the foreground and background Workers. Everything but the last line here is likely reusable by other implementations.

As part of the initialize request, you need to provide the type stubs ([example](https://github.com/microbit-foundation/python-editor-v3/blob/40ff6f64955bf552c4513a762228982114353cbd/src/language-server/client.ts#L152)).

[This code](https://github.com/microbit-foundation/python-editor-v3/blob/40ff6f64955bf552c4513a762228982114353cbd/src/language-server/client-fs.ts#L20) shows how the micro:bit Python Editor notifies Pyright of changes to files. Edits to open files are notified by the editing component itself.
