/*
 * typecheckCacheSingleton.ts
 *
 * Global singleton instance of the typecheck cache.
 */

import { TypecheckCache } from './typecheckCache';

export const typecheckCacheSingleton = new TypecheckCache();

/**
 * Configure the typecheck cache with verbose logging
 */
export function configureTypecheckCache(verbose: boolean) {
    typecheckCacheSingleton.setOptions({ verbose });
}

/**
 * Print typecheck cache summary statistics
 */
export function printTypecheckCacheSummary() {
    typecheckCacheSingleton.printCacheSummary();
}
