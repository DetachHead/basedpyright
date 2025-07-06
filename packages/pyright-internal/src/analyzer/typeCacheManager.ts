/*
 * typeCacheManager.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: BasedPyright Contributors
 *
 * Manages persistent type check caching to speed up analysis
 * and indexing for large monorepos.
 */

import { ConfigOptions } from '../common/configOptions';
import { ConsoleInterface } from '../common/console';
import { hashString } from '../common/stringUtils';
import { Uri } from '../common/uri/uri';
import { FileSystem } from '../common/fileSystem';
import { ServiceProvider } from '../common/serviceProvider';
import { makeDirectories } from '../common/uri/uriUtils';
import * as v8 from 'v8';

export const enum TypeCacheFormat {
    Binary = 'binary',
    Json = 'json',
}

export interface TypeCacheEntry {
    version: string;
    configHash: string;
    filePath: string;
    fileHash: string;
    lastModified: number;
    createdTime: number;
    analysisTime: number;
    dependencies: CacheDependency[];
    symbols: CachedSymbol[];
    types: CachedType[];
    exports: string[];
    diagnosticCount: number;
}

export interface CacheDependency {
    module: string;
    filePath: string;
    hash: string;
}

export interface CachedSymbol {
    name: string;
    kind: string;
    location: CachedLocation;
    isExported: boolean;
    isPrivate: boolean;
    declarations: CachedDeclaration[];
}

export interface CachedType {
    name: string;
    inferredType: string;
    kind: string;
    scope?: string;
    complexity: number;
}

export interface CachedLocation {
    line: number;
    column: number;
}

export interface CachedDeclaration {
    type: string;
    path: string;
    range: {
        start: CachedLocation;
        end: CachedLocation;
    };
}

export interface TypeCacheStats {
    totalEntries: number;
    totalSizeBytes: number;
    hitRate: number;
    missRate: number;
    invalidationRate: number;
    avgAnalysisTime: number;
    expensiveFiles: string[];
}

export interface CacheFileMetadata {
    analysisTime: number;
    complexity: number;
    lastAccessed: number;
    dependencies: string[];
}

export class TypeCacheManager {
    private static readonly _cacheVersion = '1.0.0';
    private static readonly _cacheDirName = '.basedpyright-cache';
    private static readonly _maxCacheSizeMb = 500;
    private static readonly _defaultMaxFiles = 5000;

    private readonly _projectRoot: Uri;
    private readonly _cacheDir: Uri;
    private readonly _indexFile: Uri;
    private readonly _configOptions: ConfigOptions;
    private readonly _fileSystem: FileSystem;
    private readonly _console: ConsoleInterface;
    private readonly _serviceProvider: ServiceProvider;
    private readonly _stats: TypeCacheStats;
    private readonly _fileMetadata = new Map<string, CacheFileMetadata>();
    private readonly _configHash: string;
    private readonly _maxCacheFiles: number;
    private readonly _format: TypeCacheFormat;

    private _cacheIndex: Map<string, TypeCacheEntry> = new Map();
    private _isLoaded = false;
    private _totalAccesses = 0;
    private _hits = 0;
    private _misses = 0;
    private _invalidations = 0;
    private _initStartTime = 0;

    constructor(
        projectRoot: Uri,
        configOptions: ConfigOptions,
        fileSystem: FileSystem,
        console: ConsoleInterface,
        serviceProvider: ServiceProvider,
        format: TypeCacheFormat = TypeCacheFormat.Binary
    ) {
        this._projectRoot = projectRoot;
        this._cacheDir = projectRoot.combinePaths(TypeCacheManager._cacheDirName);
        this._format = format;
        
        // Dynamic index filename based on format
        const indexFileName = format === TypeCacheFormat.Json ? 'index.json' : 'index.cache';
        this._indexFile = this._cacheDir.combinePaths(indexFileName);
        
        this._configOptions = configOptions;
        this._fileSystem = fileSystem;
        this._console = console;
        this._serviceProvider = serviceProvider;
        this._maxCacheFiles = configOptions.maxTypeCacheFiles ?? TypeCacheManager._defaultMaxFiles;
        this._configHash = this._computeConfigHash();

        this._stats = {
            totalEntries: 0,
            totalSizeBytes: 0,
            hitRate: 0,
            missRate: 0,
            invalidationRate: 0,
            avgAnalysisTime: 0,
            expensiveFiles: [],
        };
    }

    async initialize(): Promise<void> {
        this._initStartTime = Date.now();

        try {
            await this._ensureCacheDirectory();
            await this._loadCacheIndex();
            await this._validateCacheEntries();
            this._isLoaded = true;

            const existingEntries = this._cacheIndex.size;

            if (this._configOptions.verboseOutput && existingEntries > 0) {
                this._console.info(`📋 Cache loaded: ${existingEntries} entries`);
                this._logCacheStats();
            }
        } catch (error) {
            this._console.error(`Failed to initialize type cache: ${error}`);
        }
    }

    async load(filePath: string): Promise<TypeCacheEntry | undefined> {
        this._totalAccesses++;

        if (!this._isLoaded) {
            await this.initialize();
        }

        const cacheKey = this._getCacheKey(filePath);
        const entry = this._cacheIndex.get(cacheKey);

        if (this._configOptions.verboseOutput) {
            this._console.info(`🔍 Cache lookup for: ${this._getDisplayPath(filePath)}`);
            this._console.info(`   Key: ${cacheKey}`);
            this._console.info(`   Found: ${!!entry}`);
            if (entry) {
                this._console.info(`   Entry path: ${entry.filePath}`);
            }
        }

        if (!entry) {
            this._misses++;
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ Cache miss: No entry found for key ${cacheKey}`);
                // Show first few cache keys for debugging
                const keys = Array.from(this._cacheIndex.keys()).slice(0, 3);
                this._console.info(`   Available keys (first 3): ${keys.join(', ')}`);
            }
            return undefined;
        }

        // Validate entry is still valid
        if (!(await this._isEntryValid(entry))) {
            this._invalidate(filePath);
            this._invalidations++;
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ Cache invalidated: Entry became invalid for ${this._getDisplayPath(filePath)}`);
            }
            return undefined;
        }

        // Update access time
        const metadata = this._fileMetadata.get(filePath);
        if (metadata) {
            metadata.lastAccessed = Date.now();
        }

        this._hits++;
        if (this._configOptions.verboseOutput) {
            this._console.info(`✅ Cache hit: ${this._getDisplayPath(filePath)}`);
        }
        return entry;
    }

    async store(filePath: string, entry: TypeCacheEntry): Promise<void> {
        if (!this._isLoaded) {
            await this.initialize();
        }

        const cacheKey = this._getCacheKey(filePath);
        entry.version = TypeCacheManager._cacheVersion;
        entry.configHash = this._configHash;

        // Store metadata for prioritization
        this._fileMetadata.set(filePath, {
            analysisTime: entry.analysisTime,
            complexity: this._computeComplexity(entry),
            lastAccessed: Date.now(),
            dependencies: entry.dependencies.map((d) => d.filePath),
        });

        // Check if we need to evict files
        if (this._cacheIndex.size >= this._maxCacheFiles) {
            await this._evictLeastImportantFiles();
        }

        this._cacheIndex.set(cacheKey, entry);

        try {
            await this._saveCacheEntry(filePath, entry);
            await this._updateCacheIndex();
        } catch (error) {
            this._console.error(`Failed to store cache entry for ${this._getDisplayPath(filePath)}: ${error}`);
        }
    }

    // Synchronous version that doesn't block the event loop
    storeSync(filePath: string, entry: TypeCacheEntry): void {
        if (!this._isLoaded) {
            // Skip if cache not loaded to avoid blocking
            return;
        }

        const cacheKey = this._getCacheKey(filePath);
        entry.version = TypeCacheManager._cacheVersion;
        entry.configHash = this._configHash;

        // Store metadata for prioritization
        this._fileMetadata.set(filePath, {
            analysisTime: entry.analysisTime,
            complexity: this._computeComplexity(entry),
            lastAccessed: Date.now(),
            dependencies: entry.dependencies.map((d) => d.filePath),
        });

        // Check if we need to evict files (synchronously)
        if (this._cacheIndex.size >= this._maxCacheFiles) {
            this._evictLeastImportantFilesSync();
        }

        this._cacheIndex.set(cacheKey, entry);

        try {
            this._saveCacheEntrySync(filePath, entry);
            // Note: Index update is done separately for batch operations
        } catch (error) {
            this._console.error(`Failed to store cache entry for ${this._getDisplayPath(filePath)}: ${error}`);
        }
    }

    // Flush the cache index after batch operations
    flushCacheIndex(): void {
        try {
            this._updateCacheIndexSync();
        } catch (error) {
            this._console.error(`Failed to update cache index: ${error}`);
        }
    }

    async invalidate(filePath: string): Promise<void> {
        this._invalidate(filePath);
        await this._updateCacheIndex();
        this._console.log(`🗑️  Invalidated cache: ${this._getDisplayPath(filePath)}`);
    }

    async invalidateByDependency(dependencyPath: string): Promise<void> {
        const toInvalidate: string[] = [];

        for (const [key, entry] of this._cacheIndex) {
            const depends = entry.dependencies.some((dep) => dep.filePath === dependencyPath);
            if (depends) {
                toInvalidate.push(this._getFilePathFromKey(key));
            }
        }

        if (toInvalidate.length > 0) {
            this._console.info(
                `🔄 Invalidating ${toInvalidate.length} files dependent on ${this._getDisplayPath(dependencyPath)}`
            );

            for (const filePath of toInvalidate) {
                this._invalidate(filePath);
            }

            await this._updateCacheIndex();
        }
    }

    getStats(): TypeCacheStats {
        this._updateStats();
        return { ...this._stats };
    }

    getCacheKey(filePath: string): string {
        return this._getCacheKey(filePath);
    }

    hasValidEntry(cacheKey: string): boolean {
        if (!this._isLoaded) {
            return false;
        }

        const entry = this._cacheIndex.get(cacheKey);
        if (!entry) {
            return false;
        }

        // Quick validation - check version and config hash only
        // Skip file content and dependency validation for performance
        return entry.version === TypeCacheManager._cacheVersion && entry.configHash === this._configHash;
    }

    async cleanup(): Promise<void> {
        this._console.info('🧹 Starting cache cleanup...');

        const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
        const toRemove: string[] = [];

        for (const [key, entry] of this._cacheIndex) {
            if (entry.lastModified < cutoffTime) {
                toRemove.push(this._getFilePathFromKey(key));
            }
        }

        if (toRemove.length > 0) {
            this._console.info(`🗂️  Removing ${toRemove.length} old cache entries`);

            for (const filePath of toRemove) {
                this._invalidate(filePath);
            }

            await this._updateCacheIndex();
        } else {
            this._console.info('✨ Cache cleanup complete - no old entries found');
        }
    }

    private async _ensureCacheDirectory(): Promise<void> {
        if (!this._fileSystem.existsSync(this._cacheDir)) {
            this._console.info(`📁 Creating cache directory: ${this._cacheDir.toUserVisibleString()}`);
            makeDirectories(this._fileSystem, this._cacheDir, this._projectRoot);
        }
    }

    private async _loadCacheIndex(): Promise<void> {
        try {
            if (!this._fileSystem.existsSync(this._indexFile)) {
                this._console.info('📄 No existing cache index found, starting fresh');
                return;
            }

            let indexData: any;

            if (this._format === TypeCacheFormat.Json) {
                const indexContent = this._fileSystem.readFileSync(this._indexFile, 'utf8');
                indexData = JSON.parse(indexContent);
            } else {
                // Binary format
                const indexBuffer = this._fileSystem.readFileSync(this._indexFile);
                indexData = v8.deserialize(indexBuffer);
            }

            let loadedEntries = 0;
            for (const [key, entry] of Object.entries(indexData.entries || {})) {
                this._cacheIndex.set(key, entry as TypeCacheEntry);
                loadedEntries++;
            }

            // Load metadata
            let loadedMetadata = 0;
            if (indexData.metadata) {
                for (const [filePath, metadata] of Object.entries(indexData.metadata)) {
                    this._fileMetadata.set(filePath, metadata as CacheFileMetadata);
                    loadedMetadata++;
                }
            }

            this._console.info(`📖 Loaded cache index: ${loadedEntries} entries, ${loadedMetadata} metadata records`);
        } catch (error) {
            this._console.error(`❌ Failed to load cache index: ${error}`);
        }
    }

    private async _saveCacheEntry(filePath: string, entry: TypeCacheEntry): Promise<void> {
        const entryFileName = this._getEntryFileName(filePath);
        const entryPath = this._cacheDir.combinePaths(entryFileName);

        let serializedData: string | Buffer;

        if (this._format === TypeCacheFormat.Json) {
            serializedData = JSON.stringify(entry, null, 2);
        } else {
            // True binary format using Node.js v8 serialization
            serializedData = v8.serialize(entry);
        }

        this._fileSystem.writeFileSync(
            entryPath,
            serializedData,
            this._format === TypeCacheFormat.Json ? 'utf8' : null
        );
    }

    private async _updateCacheIndex(): Promise<void> {
        const indexData = {
            version: TypeCacheManager._cacheVersion,
            entries: Object.fromEntries(this._cacheIndex),
            metadata: Object.fromEntries(this._fileMetadata),
            lastUpdated: Date.now(),
        };

        let serializedData: string | Buffer;
        let encoding: 'utf8' | null;

        if (this._format === TypeCacheFormat.Json) {
            serializedData = JSON.stringify(indexData, null, 2);
            encoding = 'utf8';
        } else {
            // Binary format for cache index too
            serializedData = v8.serialize(indexData);
            encoding = null;
        }

        this._fileSystem.writeFileSync(this._indexFile, serializedData, encoding);
    }

    private async _validateCacheEntries(): Promise<void> {
        const invalidEntries: string[] = [];
        const totalEntries = this._cacheIndex.size;
        let validatedCount = 0;

        if (this._configOptions.verboseOutput) {
            this._console.info(`🔍 Validating ${totalEntries} cache entries...`);
        }

        for (const [key, entry] of this._cacheIndex) {
            validatedCount++;
            if (!(await this._isEntryValid(entry))) {
                invalidEntries.push(this._getFilePathFromKey(key));
            }

            // Show progress for large validation batches
            if (this._configOptions.verboseOutput && validatedCount % 100 === 0) {
                this._console.info(`🔍 Validated ${validatedCount}/${totalEntries} entries...`);
            }
        }

        if (invalidEntries.length > 0) {
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ Invalidating ${invalidEntries.length}/${totalEntries} cache entries`);
                if (invalidEntries.length <= 10) {
                    invalidEntries.forEach((file) => this._console.info(`   - ${this._getDisplayPath(file)}`));
                }
            }

            for (const filePath of invalidEntries) {
                this._invalidate(filePath);
            }
        } else if (this._configOptions.verboseOutput) {
            this._console.info(`✅ All ${totalEntries} cache entries are valid`);
        }
    }

    private async _isEntryValid(entry: TypeCacheEntry): Promise<boolean> {
        if (this._configOptions.verboseOutput) {
            this._console.info(`🔍 Validating cache entry for ${this._getDisplayPath(entry.filePath)}`);
        }

        // Check version compatibility
        if (entry.version !== TypeCacheManager._cacheVersion) {
            if (this._configOptions.verboseOutput) {
                this._console.info(
                    `❌ Cache version mismatch for ${this._getDisplayPath(entry.filePath)}: ${entry.version} vs ${
                        TypeCacheManager._cacheVersion
                    }`
                );
            }
            return false;
        }

        // Check config hash
        if (entry.configHash !== this._configHash) {
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ Config hash mismatch for ${this._getDisplayPath(entry.filePath)}`);
                this._console.info(`   Stored: ${entry.configHash}`);
                this._console.info(`   Current: ${this._configHash}`);
            }
            return false;
        }

        // Check if file still exists and hash matches
        const fileUri = Uri.file(entry.filePath, this._serviceProvider);
        if (!this._fileSystem.existsSync(fileUri)) {
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ File not found: ${this._getDisplayPath(entry.filePath)}`);
            }
            return false;
        }

        const fileContent = this._fileSystem.readFileSync(fileUri, 'utf8');
        const currentHash = hashString(fileContent).toString();
        if (currentHash !== entry.fileHash) {
            if (this._configOptions.verboseOutput) {
                this._console.info(`❌ File hash mismatch for ${this._getDisplayPath(entry.filePath)}`);
                this._console.info(`   Stored: ${entry.fileHash}`);
                this._console.info(`   Current: ${currentHash}`);
            }
            return false;
        }

        // Check dependencies
        for (const dep of entry.dependencies) {
            const depUri = Uri.file(dep.filePath, this._serviceProvider);
            if (!this._fileSystem.existsSync(depUri)) {
                if (this._configOptions.verboseOutput) {
                    this._console.info(`❌ Dependency not found: ${dep.filePath}`);
                }
                return false;
            }

            const depContent = this._fileSystem.readFileSync(depUri, 'utf8');
            const depHash = hashString(depContent).toString();
            if (depHash !== dep.hash) {
                if (this._configOptions.verboseOutput) {
                    this._console.info(`❌ Dependency hash mismatch for ${dep.filePath}`);
                    this._console.info(`   Stored: ${dep.hash}`);
                    this._console.info(`   Current: ${depHash}`);
                }
                return false;
            }
        }

        if (this._configOptions.verboseOutput) {
            this._console.info(`✅ Cache entry is valid for ${this._getDisplayPath(entry.filePath)}`);
        }

        return true;
    }

    private _invalidate(filePath: string): void {
        const cacheKey = this._getCacheKey(filePath);
        this._cacheIndex.delete(cacheKey);
        this._fileMetadata.delete(filePath);

        // Remove cache file
        const entryFileName = this._getEntryFileName(filePath);
        const entryPath = this._cacheDir.combinePaths(entryFileName);
        if (this._fileSystem.existsSync(entryPath)) {
            this._fileSystem.unlinkSync(entryPath);
        }
    }

    private async _evictLeastImportantFiles(): Promise<void> {
        this._console.info(
            `🔄 Cache full (${this._cacheIndex.size}/${this._maxCacheFiles}), evicting least important files...`
        );

        // Calculate importance score for each file
        const scoredFiles: Array<{ filePath: string; score: number }> = [];

        for (const [filePath, metadata] of this._fileMetadata) {
            const score = this._calculateImportanceScore(metadata, filePath);
            scoredFiles.push({ filePath, score });
        }

        // Sort by score (lowest first = least important)
        scoredFiles.sort((a, b) => a.score - b.score);

        // Evict bottom 10% of files
        const toEvict = Math.floor(scoredFiles.length * 0.1);
        const evictedFiles: string[] = [];

        for (let i = 0; i < toEvict; i++) {
            evictedFiles.push(scoredFiles[i].filePath);
            this._invalidate(scoredFiles[i].filePath);
        }

        this._console.info(`🗑️  Evicted ${evictedFiles.length} files from cache`);
        if (evictedFiles.length <= 5) {
            evictedFiles.forEach((file) => this._console.log(`  - ${this._getDisplayPath(file)}`));
        }
    }

    // Synchronous version of eviction
    private _evictLeastImportantFilesSync(): void {
        this._console.info(
            `🔄 Cache full (${this._cacheIndex.size}/${this._maxCacheFiles}), evicting least important files...`
        );

        // Calculate importance score for each file
        const scoredFiles: Array<{ filePath: string; score: number }> = [];

        for (const [filePath, metadata] of this._fileMetadata) {
            const score = this._calculateImportanceScore(metadata, filePath);
            scoredFiles.push({ filePath, score });
        }

        // Sort by score (lowest first = least important)
        scoredFiles.sort((a, b) => a.score - b.score);

        // Evict bottom 10% of files
        const toEvict = Math.floor(scoredFiles.length * 0.1);
        const evictedFiles: string[] = [];

        for (let i = 0; i < toEvict; i++) {
            evictedFiles.push(scoredFiles[i].filePath);
            this._invalidate(scoredFiles[i].filePath);
        }

        this._console.info(`🗑️  Evicted ${evictedFiles.length} files from cache`);
        if (evictedFiles.length <= 5) {
            evictedFiles.forEach((file) => this._console.log(`  - ${this._getDisplayPath(file)}`));
        }
    }

    // Synchronous version of saving cache entry
    private _saveCacheEntrySync(filePath: string, entry: TypeCacheEntry): void {
        const entryFileName = this._getEntryFileName(filePath);
        const entryPath = this._cacheDir.combinePaths(entryFileName);

        let serializedData: string | Buffer;

        if (this._format === TypeCacheFormat.Json) {
            serializedData = JSON.stringify(entry, null, 2);
        } else {
            // True binary format using Node.js v8 serialization
            serializedData = v8.serialize(entry);
        }

        this._fileSystem.writeFileSync(
            entryPath,
            serializedData,
            this._format === TypeCacheFormat.Json ? 'utf8' : null
        );
    }

    // Synchronous version of updating cache index
    private _updateCacheIndexSync(): void {
        const indexData = {
            version: TypeCacheManager._cacheVersion,
            entries: Object.fromEntries(this._cacheIndex),
            metadata: Object.fromEntries(this._fileMetadata),
            lastUpdated: Date.now(),
        };

        let serializedData: string | Buffer;
        let encoding: 'utf8' | null;

        if (this._format === TypeCacheFormat.Json) {
            serializedData = JSON.stringify(indexData, null, 2);
            encoding = 'utf8';
        } else {
            // Binary format for cache index too
            serializedData = v8.serialize(indexData);
            encoding = null;
        }

        this._fileSystem.writeFileSync(this._indexFile, serializedData, encoding);
    }

    private _calculateImportanceScore(metadata: CacheFileMetadata, filePath?: string): number {
        const now = Date.now();
        const daysSinceAccess = (now - metadata.lastAccessed) / (1000 * 60 * 60 * 24);
        const analysisTimeSeconds = metadata.analysisTime / 1000;

        // Weighted scoring system (higher score = more important = kept in cache)

        // 1. RECENCY SCORE (0-60 points) - PRIMARY FACTOR
        // Recently accessed files get high priority
        const recencyScore = Math.max(0, 60 - daysSinceAccess * 2); // Linear decay over 30 days

        // 2. ANALYSIS TIME SCORE (0-40 points) - SECONDARY FACTOR
        // Normalize expensive analysis to reasonable range
        const timeScore = Math.min(40, analysisTimeSeconds * 8); // Cap at 40 points (5+ seconds)

        // 3. COMPLEXITY SCORE (raw value) - TIE-BREAKER
        // Keep as-is since it provides good differentiation
        const complexityScore = metadata.complexity;

        const totalScore = recencyScore + timeScore + complexityScore;

        // Debug logging for first few files if verbose
        if (this._configOptions.verboseOutput && Math.random() < 0.01 && filePath) {
            // Log ~1% of files
            const displayPath = this._getDisplayPath(filePath);
            this._console.info(`📊 Score breakdown for ${displayPath}:`);
            this._console.info(`   Recency: ${recencyScore.toFixed(1)} (${daysSinceAccess.toFixed(1)} days ago)`);
            this._console.info(`   Analysis: ${timeScore.toFixed(1)} (${analysisTimeSeconds.toFixed(2)}s)`);
            this._console.info(`   Complexity: ${complexityScore}`);
            this._console.info(`   Total: ${totalScore.toFixed(1)}`);
        }

        return totalScore;
    }

    private _computeComplexity(entry: TypeCacheEntry): number {
        // Simple complexity metric based on symbols, types, and dependencies
        return entry.symbols.length + entry.types.length + entry.dependencies.length;
    }

    private _computeConfigHash(): string {
        const configData = {
            typeCheckingMode: this._configOptions.effectiveTypeCheckingMode,
            pythonVersion: this._configOptions.defaultPythonVersion,
            extraPaths: this._configOptions.defaultExtraPaths?.map((p) => p.toString()),
        };

        const jsonString = JSON.stringify(configData);
        const hash = hashString(jsonString).toString();

        if (this._configOptions.verboseOutput) {
            this._console.info(`🔧 Config hash computation:`);
            this._console.info(`   Data: ${jsonString}`);
            this._console.info(`   Hash: ${hash}`);
        }

        return hash;
    }

    private _getCacheKey(filePath: string): string {
        return hashString(filePath).toString();
    }

    private _getFilePathFromKey(key: string): string {
        // This is a simplified reverse lookup - in practice, you'd store the mapping
        for (const [cacheKey, entry] of this._cacheIndex) {
            if (cacheKey === key) {
                return entry.filePath;
            }
        }
        return '';
    }

    private _getEntryFileName(filePath: string): string {
        const key = this._getCacheKey(filePath);
        const entry = this._cacheIndex.get(key);
        const timestamp = entry?.createdTime ?? Date.now();
        const extension = this._format === TypeCacheFormat.Json ? '.json' : '.cache';
        return `${key}_${timestamp}${extension}`;
    }

    private _updateStats(): void {
        this._stats.totalEntries = this._cacheIndex.size;
        this._stats.hitRate = this._totalAccesses > 0 ? this._hits / this._totalAccesses : 0;
        this._stats.missRate = this._totalAccesses > 0 ? this._misses / this._totalAccesses : 0;
        this._stats.invalidationRate = this._totalAccesses > 0 ? this._invalidations / this._totalAccesses : 0;

        // Calculate average analysis time
        let totalTime = 0;
        let count = 0;
        for (const metadata of this._fileMetadata.values()) {
            totalTime += metadata.analysisTime;
            count++;
        }
        this._stats.avgAnalysisTime = count > 0 ? totalTime / count : 0;

        // Find expensive files
        const expensiveFiles = Array.from(this._fileMetadata.entries())
            .filter(([, metadata]) => metadata.analysisTime > this._stats.avgAnalysisTime * 2)
            .sort((a, b) => b[1].analysisTime - a[1].analysisTime)
            .slice(0, 10)
            .map(([filePath]) => filePath);

        this._stats.expensiveFiles = expensiveFiles;
    }

    private _getDisplayPath(filePath: string): string {
        // Show relative path from project root if possible
        const fileUri = Uri.file(filePath, this._serviceProvider);
        const relativePath = this._projectRoot.getRelativePath(fileUri);
        return relativePath || filePath;
    }

    private _logCacheStats(): void {
        const stats = this.getStats();
        this._console.info(`📈 Cache statistics:`);
        this._console.info(`  Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
        this._console.info(`  Average analysis time: ${stats.avgAnalysisTime.toFixed(0)}ms`);

        if (stats.expensiveFiles.length > 0) {
            this._console.info(`  Expensive files cached: ${stats.expensiveFiles.length}`);
            stats.expensiveFiles.slice(0, 3).forEach((file) => {
                this._console.info(`    ${this._getDisplayPath(file)}`);
            });
        }
    }
}
 