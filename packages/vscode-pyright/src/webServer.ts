//TODO: does this need to be a separate file?
import { main } from 'pyright-internal/nodeMain';

Error.stackTraceLimit = 256;

// VS Code version of the server has one background thread.
main(/* maxWorkers */ 1);
