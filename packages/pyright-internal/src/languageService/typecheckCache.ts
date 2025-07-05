/*
 * typecheckCache.ts
 *
 * High-performance cache for type checking results (diagnostics).
 * Caches Diagnostic[] objects per file with smart invalidation based on
 * file content changes and dependency changes.
 */

import { Diagnostic, DiagnosticCategory } from '../common/diagnostic';
import { ProgramView } from '../common/extensibility';
import { Uri } from '../common/uri/uri';
import { FileSystem, ReadOnlyFileSystem } from '../common/fileSystem';
import { fnv1a } from '../common/fnv1a';
import { ConfigOptions } from '../common/configOptions';
import { Range } from '../common/textRange';

/**
 * Serializable diagnostic for cache storage
 */
export interface CachedDiagnostic {
    category: DiagnosticCategory;
    message: string;
    range: Range;
    rule?: string;
    severity?: number;
    relatedInfo?: any[];
    actions?: any[];
}

/**
 * Cache entry for a single file's typecheck results
 */
export interface FileDiagnosticCache {
    /** File modification time */
    mtime: number;
    /** Content hash (first 8KB) for change detection */
    hash: string;
    /** Hash of configuration options that affect type checking */
    configHash: string;
    /** Hash of import dependencies */
    dependencyHash: string;
    /** Cached diagnostic results */
    diagnostics: CachedDiagnostic[];
    /** Timestamp when cache was created */
    cacheTime: number;
}

/**
 * Persisted representation of typecheck cache
 */
export interface CachedTypecheckResults {
    /** Cache format version */
    version: number;
    /** Overall checksum for quick invalidation */
    checksum: string;
    /** Files and their diagnostic cache entries */
    files: Record<string, FileDiagnosticCache>;
}

/**
 * Options for typecheck cache
 */
export interface TypecheckCacheOptions {
    /** Maximum number of files to cache */
    maxFiles?: number;
    /** Whether to enable verbose logging */
    verbose?: boolean;
    /** Whether to cache third-party file diagnostics */
    cacheThirdParty?: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface TypecheckCacheStats {
    /** Number of workspaces cached */
    workspaceCount: number;
    /** Total files with cached diagnostics */
    totalFileCount: number;
    /** Total cached diagnostics */
    totalDiagnosticCount: number;
    /** Average diagnostics per file */
    averageDiagnosticsPerFile: number;
    /** Cache hit rate */
    cacheHitRate: number;
    /** Total cache queries */
    totalQueries: number;
    /** Total cache hits */
    totalHits: number;
    /** Total time saved (ms) */
    totalTimeSaved: number;
}

/**
 * High-performance cache for type checking results
 */
export class TypecheckCache {
    private _cache = new Map<string /* workspaceRoot.key */, CachedTypecheckResults>();
    private _cacheMetadata = new Map<string, { checksum: string; fileCount: number; lastModified: number }>();
    private _saveTimers = new Map<string, any>();
    private _buildingCaches = new Set<string>();
    private _totalQueries = 0;
    private _totalHits = 0;
    private _totalTimeSaved = 0;

    private _options: Required<TypecheckCacheOptions>;

    constructor(options?: TypecheckCacheOptions) {
        this._options = {
            maxFiles: options?.maxFiles ?? 5000,
            verbose: options?.verbose ?? false,
            cacheThirdParty: options?.cacheThirdParty ?? false,
        };
    }

    /**
     * Set cache options
     */
    setOptions(options: Partial<TypecheckCacheOptions>) {
        this._options = { ...this._options, ...options };
    }

    /**
     * Check if file has cached diagnostics and return them if valid
     */
    getCachedDiagnostics(
        workspaceRoot: Uri,
        fileUri: Uri,
        program: ProgramView,
        configOptions: ConfigOptions
    ): Diagnostic[] | null {
        this._totalQueries++;

        let cached = this._cache.get(workspaceRoot.key);
        if (!cached) {
            const loadedCache = this._loadFromDisk(workspaceRoot, program.fileSystem);
            if (!loadedCache) {
                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - No cache file found`);
                }
                return null;
            }
            // Store the loaded cache in memory for future use
            cached = loadedCache;
            this._cache.set(workspaceRoot.key, cached);
        }

        const fileUriStr = fileUri.toString();
        const fileCache = cached.files[fileUriStr];
        if (!fileCache) {
            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - File not in cache`);
            }
            return null;
        }

        // Check if file has changed
        try {
            const stat = program.fileSystem.statSync(fileUri);
            if (!stat || (stat.mtimeMs || 0) !== fileCache.mtime) {
                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - File modified (mtime: ${stat?.mtimeMs || 0} vs cached: ${fileCache.mtime})`);
                }
                return null;
            }

            // Check content hash
            const bytes = program.fileSystem.readFileSync(fileUri, null).subarray(0, 8192);
            const currentHash = fnv1a(bytes);
            if (currentHash !== fileCache.hash) {
                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - Content changed (hash: ${currentHash} vs cached: ${fileCache.hash})`);
                }
                return null;
            }

            // Check config hash
            const configHash = this._computeConfigHash(configOptions);
            if (configHash !== fileCache.configHash) {
                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - Config changed (hash: ${configHash} vs cached: ${fileCache.configHash})`);
                }
                return null;
            }

            // Check dependency hash
            const dependencyHash = this._computeDependencyHash(fileUri, program);
            if (dependencyHash !== fileCache.dependencyHash) {
                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - Dependencies changed (hash: ${dependencyHash} vs cached: ${fileCache.dependencyHash})`);
                }
                return null;
            }

            // Cache hit - convert back to Diagnostic objects
            this._totalHits++;

            if (this._options.verbose) {
                console.log(
                    `[TYPECHECK-CACHE] HIT: ${fileUri.toUserVisibleString()} (${
                        fileCache.diagnostics.length
                    } diagnostics, saved ~50ms)`
                );
            }

            return fileCache.diagnostics.map((d) => this._deserializeDiagnostic(d));
        } catch (error) {
            // File might be deleted or inaccessible
            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] MISS: ${fileUri.toUserVisibleString()} - File access error: ${error}`);
            }
            return null;
        }
    }

    /**
     * Cache diagnostics for a file
     */
    cacheDiagnostics(
        workspaceRoot: Uri,
        fileUri: Uri,
        diagnostics: Diagnostic[],
        program: ProgramView,
        configOptions: ConfigOptions
    ): void {
        try {
            const stat = program.fileSystem.statSync(fileUri);
            if (!stat) {
                return;
            }

            const mtime = stat.mtimeMs || 0;
            const bytes = program.fileSystem.readFileSync(fileUri, null).subarray(0, 8192);
            const hash = fnv1a(bytes);
            const configHash = this._computeConfigHash(configOptions);
            const dependencyHash = this._computeDependencyHash(fileUri, program);

            const fileCache: FileDiagnosticCache = {
                mtime,
                hash,
                configHash,
                dependencyHash,
                diagnostics: diagnostics.map((d) => this._serializeDiagnostic(d)),
                cacheTime: Date.now(),
            };

            // Get or create workspace cache
            let cached = this._cache.get(workspaceRoot.key);
            if (!cached) {
                cached = this._loadFromDisk(workspaceRoot, program.fileSystem) || {
                    version: 1,
                    checksum: '',
                    files: {},
                };
            }

            // Add/update file cache
            const fileUriStr = fileUri.toString();
            cached.files[fileUriStr] = fileCache;

            // Enforce max files limit
            const fileKeys = Object.keys(cached.files);
            if (fileKeys.length > this._options.maxFiles) {
                // Remove oldest cache entries
                const sorted = fileKeys.sort((a, b) => {
                    const aTime = cached!.files[a].cacheTime;
                    const bTime = cached!.files[b].cacheTime;
                    return aTime - bTime;
                });

                const toRemove = sorted.slice(0, fileKeys.length - this._options.maxFiles);
                toRemove.forEach((key) => delete cached!.files[key]);
            }

            // Update checksum
            cached.checksum = this._computeWorkspaceChecksum(cached);

            // Store in memory and schedule disk save
            this._cache.set(workspaceRoot.key, cached);
            if ('writeFileSync' in program.fileSystem) {
                this._scheduleSaveToDisk(workspaceRoot, cached, program.fileSystem as FileSystem);
            }

            if (this._options.verbose) {
                console.log(
                    `[TYPECHECK-CACHE] REINDEX: ${fileUri.toUserVisibleString()} (${diagnostics.length} diagnostics cached)`
                );
            }
        } catch (error) {
            // Ignore cache errors - don't break type checking
            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] Cache error: ${error}`);
            }
        }
    }

    /**
     * Clear cache for a specific file or entire workspace
     */
    invalidate(workspaceRoot: Uri, fileUri?: Uri): void {
        const key = workspaceRoot.key;

        if (!fileUri) {
            // Clear entire workspace
            this._cache.delete(key);
            this._cacheMetadata.delete(key);

            const timer = this._saveTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                this._saveTimers.delete(key);
            }

            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] Invalidated workspace: ${workspaceRoot.toUserVisibleString()}`);
            }
        } else {
            // Clear specific file
            const cached = this._cache.get(key);
            if (cached) {
                const fileUriStr = fileUri.toString();
                delete cached.files[fileUriStr];
                cached.checksum = this._computeWorkspaceChecksum(cached);

                if (this._options.verbose) {
                    console.log(`[TYPECHECK-CACHE] Invalidated file: ${fileUri.toUserVisibleString()}`);
                }
            }
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): TypecheckCacheStats {
        let totalFiles = 0;
        let totalDiagnostics = 0;
        let workspaceCount = 0;

        for (const cached of this._cache.values()) {
            workspaceCount++;
            totalFiles += Object.keys(cached.files).length;
            for (const fileCache of Object.values(cached.files)) {
                totalDiagnostics += fileCache.diagnostics.length;
            }
        }

        return {
            workspaceCount,
            totalFileCount: totalFiles,
            totalDiagnosticCount: totalDiagnostics,
            averageDiagnosticsPerFile: totalFiles > 0 ? Math.round(totalDiagnostics / totalFiles) : 0,
            cacheHitRate: this._totalQueries > 0 ? this._totalHits / this._totalQueries : 0,
            totalQueries: this._totalQueries,
            totalHits: this._totalHits,
            totalTimeSaved: this._totalTimeSaved,
        };
    }

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        this._cache.clear();
        this._cacheMetadata.clear();
        this._saveTimers.forEach((timer) => clearTimeout(timer));
        this._saveTimers.clear();
        this._buildingCaches.clear();
    }

    /**
     * Record time saved by cache hit
     */
    recordTimeSaved(milliseconds: number): void {
        this._totalTimeSaved += milliseconds;
    }

    /**
     * Print cache summary statistics
     */
    printCacheSummary(): void {
        if (this._totalQueries === 0) {
            return;
        }

        const stats = this.getCacheStats();
        const hitRate = (stats.cacheHitRate * 100).toFixed(1);
        const timeSavedSeconds = (stats.totalTimeSaved / 1000).toFixed(1);
        
        console.log(`\n[TYPECHECK-CACHE] Summary:`);
        console.log(`  Total queries: ${stats.totalQueries}`);
        console.log(`  Cache hits: ${stats.totalHits}`);
        console.log(`  Cache misses: ${stats.totalQueries - stats.totalHits}`);
        console.log(`  Hit rate: ${hitRate}%`);
        console.log(`  Time saved: ${timeSavedSeconds}s`);
        console.log(`  Files cached: ${stats.totalFileCount}`);
        console.log(`  Workspaces: ${stats.workspaceCount}`);
    }

    private _loadFromDisk(
        workspaceRoot: Uri,
        fileSystem: FileSystem | ReadOnlyFileSystem
    ): CachedTypecheckResults | null {
        try {
            const cacheFileUri = this._getCacheFileUri(workspaceRoot);
            if (!fileSystem.existsSync(cacheFileUri)) {
                return null;
            }

            const content = fileSystem.readFileSync(cacheFileUri, 'utf8');
            const cached: CachedTypecheckResults = JSON.parse(content);

            // Version check
            if (cached.version !== 1) {
                return null;
            }

            if (this._options.verbose) {
                const fileCount = Object.keys(cached.files).length;
                const diagnosticCount = Object.values(cached.files).reduce(
                    (sum, file) => sum + file.diagnostics.length,
                    0
                );
                console.log(`[TYPECHECK-CACHE] Loaded from disk: ${fileCount} files, ${diagnosticCount} diagnostics`);
            }

            return cached;
        } catch (error) {
            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] Failed to load from disk: ${error}`);
            }
            return null;
        }
    }

    private _scheduleSaveToDisk(workspaceRoot: Uri, cached: CachedTypecheckResults, fileSystem: FileSystem): void {
        const key = workspaceRoot.key;

        // Clear existing timer
        const existingTimer = this._saveTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Schedule new save
        const timer = setTimeout(() => {
            this._saveToDisk(workspaceRoot, cached, fileSystem);
            this._saveTimers.delete(key);
        }, 1000); // 1 second delay to batch saves

        this._saveTimers.set(key, timer);
    }

    private _saveToDisk(workspaceRoot: Uri, cached: CachedTypecheckResults, fileSystem: FileSystem): void {
        try {
            const cacheFileUri = this._getCacheFileUri(workspaceRoot);
            const cacheDir = cacheFileUri.getDirectory();

            // Ensure cache directory exists
            if (!fileSystem.existsSync(cacheDir)) {
                fileSystem.mkdirSync(cacheDir, { recursive: true });
            }

            const content = JSON.stringify(cached, null, 2);
            fileSystem.writeFileSync(cacheFileUri, content, 'utf8');

            if (this._options.verbose) {
                const fileCount = Object.keys(cached.files).length;
                const diagnosticCount = Object.values(cached.files).reduce(
                    (sum, file) => sum + file.diagnostics.length,
                    0
                );
                console.log(`[TYPECHECK-CACHE] Saved to disk: ${fileCount} files, ${diagnosticCount} diagnostics`);
            }
        } catch (error) {
            if (this._options.verbose) {
                console.log(`[TYPECHECK-CACHE] Failed to save to disk: ${error}`);
            }
        }
    }

    private _getCacheFileUri(workspaceRoot: Uri): Uri {
        return workspaceRoot.combinePaths('.pyright', 'typecheckCache_v1.json');
    }

    private _computeConfigHash(configOptions: ConfigOptions): string {
        // Hash configuration options that affect type checking
        const relevantConfig = {
            checkOnlyOpenFiles: configOptions.checkOnlyOpenFiles,
            pythonVersion: configOptions.getDefaultExecEnvironment().pythonVersion,
            pythonPlatform: configOptions.getDefaultExecEnvironment().pythonPlatform,
            useLibraryCodeForTypes: configOptions.useLibraryCodeForTypes,
            effectiveTypeCheckingMode: configOptions.effectiveTypeCheckingMode,
            diagnosticRuleSet: configOptions.diagnosticRuleSet,
            strict: configOptions.strict,
        };

        const configStr = JSON.stringify(relevantConfig);
        return fnv1a(new TextEncoder().encode(configStr));
    }

    private _computeDependencyHash(fileUri: Uri, program: ProgramView): string {
        // Get file's imports and compute hash of their modification times
        const sourceFileInfo = program.getSourceFileInfo(fileUri);
        if (!sourceFileInfo) {
            return '';
        }

        const imports = sourceFileInfo.imports || [];
        const importData = imports
            .map((imp) => {
                try {
                    const impUri = imp.uri;
                    const stat = program.fileSystem.statSync(impUri);
                    return `${impUri.toString()}:${stat?.mtimeMs || 0}`;
                } catch {
                    return `${imp.uri.toString()}:0`;
                }
            })
            .sort()
            .join('|');

        return fnv1a(new TextEncoder().encode(importData));
    }

    private _computeWorkspaceChecksum(cached: CachedTypecheckResults): string {
        const checksumData = Object.keys(cached.files)
            .sort()
            .map((uri) => {
                const file = cached.files[uri];
                return `${uri}:${file.mtime}:${file.hash}:${file.configHash}:${file.dependencyHash}`;
            })
            .join('|');

        return fnv1a(new TextEncoder().encode(checksumData));
    }

    private _serializeDiagnostic(diagnostic: Diagnostic): CachedDiagnostic {
        return {
            category: diagnostic.category,
            message: diagnostic.message,
            range: diagnostic.range,
            rule: diagnostic.getRule(),
            severity: undefined, // Severity not available in this API
            relatedInfo: diagnostic.getRelatedInfo(),
            actions: diagnostic.getActions(),
        };
    }

    private _deserializeDiagnostic(cached: CachedDiagnostic): Diagnostic {
        const diagnostic = new Diagnostic(cached.category, cached.message, cached.range);

        if (cached.rule) {
            diagnostic.setRule(cached.rule);
        }

        // Severity not settable in this API

        if (cached.relatedInfo) {
            cached.relatedInfo.forEach((info) => {
                if (info.message && info.uri && info.range) {
                    diagnostic.addRelatedInfo(info.message, info.uri, info.range);
                }
            });
        }

        if (cached.actions) {
            cached.actions.forEach((action) => {
                diagnostic.addAction(action);
            });
        }

        return diagnostic;
    }
}
