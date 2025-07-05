/*
 * typeCacheManager.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: BasedPyright Contributors
 *
 * Manages persistent type check caching to speed up analysis
 * and indexing for large monorepos.
 */

import { CancellationToken } from 'vscode-languageserver';

import { ConfigOptions } from '../common/configOptions';
import { ConsoleInterface } from '../common/console';
import { hashString } from '../common/stringUtils';
import { Duration } from '../common/timing';
import { Uri } from '../common/uri/uri';
import { FileSystem } from '../common/fileSystem';
import { Symbol, SymbolTable } from './symbol';
import { Declaration } from './declaration';
import { createTypeEvaluator } from './typeEvaluator';
import { TypeEvaluator } from './typeEvaluatorTypes';
import { makeDirectories } from '../common/uri/uriUtils';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

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
    private static readonly CACHE_VERSION = '1.0.0';
    private static readonly CACHE_DIR_NAME = '.basedpyright-cache';
    private static readonly INDEX_FILE_NAME = 'index.json';
    private static readonly MAX_CACHE_SIZE_MB = 500;
    private static readonly DEFAULT_MAX_FILES = 5000;
    
    private readonly _cacheDir: Uri;
    private readonly _indexFile: Uri;
    private readonly _configOptions: ConfigOptions;
    private readonly _fileSystem: FileSystem;
    private readonly _console: ConsoleInterface;
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

    constructor(
        projectRoot: Uri,
        configOptions: ConfigOptions,
        fileSystem: FileSystem,
        console: ConsoleInterface,
        format: TypeCacheFormat = TypeCacheFormat.Binary
    ) {
        this._cacheDir = projectRoot.combinePaths(TypeCacheManager.CACHE_DIR_NAME);
        this._indexFile = this._cacheDir.combinePaths(TypeCacheManager.INDEX_FILE_NAME);
        this._configOptions = configOptions;
        this._fileSystem = fileSystem;
        this._console = console;
        this._format = format;
        this._maxCacheFiles = configOptions.maxTypeCacheFiles ?? TypeCacheManager.DEFAULT_MAX_FILES;
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
        try {
            await this._ensureCacheDirectory();
            await this._loadCacheIndex();
            await this._validateCacheEntries();
            this._isLoaded = true;
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

        if (!entry) {
            this._misses++;
            return undefined;
        }

        // Validate entry is still valid
        if (!(await this._isEntryValid(entry))) {
            this._invalidate(filePath);
            this._invalidations++;
            return undefined;
        }

        // Update access time
        const metadata = this._fileMetadata.get(filePath);
        if (metadata) {
            metadata.lastAccessed = Date.now();
        }

        this._hits++;
        return entry;
    }

    async store(filePath: string, entry: TypeCacheEntry): Promise<void> {
        if (!this._isLoaded) {
            await this.initialize();
        }

        const cacheKey = this._getCacheKey(filePath);
        entry.version = TypeCacheManager.CACHE_VERSION;
        entry.configHash = this._configHash;
        
        // Store metadata for prioritization
        this._fileMetadata.set(filePath, {
            analysisTime: entry.analysisTime,
            complexity: this._computeComplexity(entry),
            lastAccessed: Date.now(),
            dependencies: entry.dependencies.map(d => d.filePath),
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
            this._console.error(`Failed to store cache entry for ${filePath}: ${error}`);
        }
    }

    async invalidate(filePath: string): Promise<void> {
        this._invalidate(filePath);
        await this._updateCacheIndex();
    }

    async invalidateByDependency(dependencyPath: string): Promise<void> {
        const toInvalidate: string[] = [];
        
        for (const [key, entry] of this._cacheIndex) {
            const depends = entry.dependencies.some(dep => dep.filePath === dependencyPath);
            if (depends) {
                toInvalidate.push(this._getFilePathFromKey(key));
            }
        }

        for (const filePath of toInvalidate) {
            this._invalidate(filePath);
        }

        if (toInvalidate.length > 0) {
            await this._updateCacheIndex();
        }
    }

    getStats(): TypeCacheStats {
        this._updateStats();
        return { ...this._stats };
    }

    async cleanup(): Promise<void> {
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        const toRemove: string[] = [];

        for (const [key, entry] of this._cacheIndex) {
            if (entry.lastModified < cutoffTime) {
                toRemove.push(this._getFilePathFromKey(key));
            }
        }

        for (const filePath of toRemove) {
            this._invalidate(filePath);
        }

        await this._updateCacheIndex();
    }

    private async _ensureCacheDirectory(): Promise<void> {
        if (!this._fileSystem.existsSync(this._cacheDir)) {
            makeDirectories(this._fileSystem, this._cacheDir);
        }
    }

    private async _loadCacheIndex(): Promise<void> {
        try {
            if (!this._fileSystem.existsSync(this._indexFile)) {
                return;
            }

            const indexContent = this._fileSystem.readFileSync(this._indexFile, 'utf8');
            const indexData = JSON.parse(indexContent);

            for (const [key, entry] of Object.entries(indexData.entries || {})) {
                this._cacheIndex.set(key, entry as TypeCacheEntry);
            }

            // Load metadata
            if (indexData.metadata) {
                for (const [filePath, metadata] of Object.entries(indexData.metadata)) {
                    this._fileMetadata.set(filePath, metadata as CacheFileMetadata);
                }
            }
        } catch (error) {
            this._console.error(`Failed to load cache index: ${error}`);
        }
    }

    private async _saveCacheEntry(filePath: string, entry: TypeCacheEntry): Promise<void> {
        const entryFileName = this._getEntryFileName(filePath);
        const entryPath = this._cacheDir.combinePaths(entryFileName);
        
        let serializedData: string | Buffer;
        
        if (this._format === TypeCacheFormat.Json) {
            serializedData = JSON.stringify(entry, null, 2);
        } else {
            // Binary format - simplified custom serialization
            serializedData = Buffer.from(JSON.stringify(entry));
        }

        this._fileSystem.writeFileSync(entryPath, serializedData);
    }

    private async _updateCacheIndex(): Promise<void> {
        const indexData = {
            version: TypeCacheManager.CACHE_VERSION,
            entries: Object.fromEntries(this._cacheIndex),
            metadata: Object.fromEntries(this._fileMetadata),
            lastUpdated: Date.now(),
        };

        this._fileSystem.writeFileSync(this._indexFile, JSON.stringify(indexData, null, 2));
    }

    private async _validateCacheEntries(): Promise<void> {
        const invalidEntries: string[] = [];

        for (const [key, entry] of this._cacheIndex) {
            if (!(await this._isEntryValid(entry))) {
                invalidEntries.push(this._getFilePathFromKey(key));
            }
        }

        for (const filePath of invalidEntries) {
            this._invalidate(filePath);
        }
    }

    private async _isEntryValid(entry: TypeCacheEntry): Promise<boolean> {
        // Check version compatibility
        if (entry.version !== TypeCacheManager.CACHE_VERSION) {
            return false;
        }

        // Check config hash
        if (entry.configHash !== this._configHash) {
            return false;
        }

        // Check if file still exists and hash matches
        const fileUri = Uri.file(entry.filePath, /* serviceProvider */ undefined);
        if (!this._fileSystem.existsSync(fileUri)) {
            return false;
        }

        const fileContent = this._fileSystem.readFileSync(fileUri, 'utf8');
        const currentHash = hashString(fileContent);
        if (currentHash !== entry.fileHash) {
            return false;
        }

        // Check dependencies
        for (const dep of entry.dependencies) {
            const depUri = Uri.file(dep.filePath, /* serviceProvider */ undefined);
            if (!this._fileSystem.existsSync(depUri)) {
                return false;
            }

            const depContent = this._fileSystem.readFileSync(depUri, 'utf8');
            const depHash = hashString(depContent);
            if (depHash !== dep.hash) {
                return false;
            }
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
        // Calculate importance score for each file
        const scoredFiles: Array<{filePath: string, score: number}> = [];
        
        for (const [filePath, metadata] of this._fileMetadata) {
            const score = this._calculateImportanceScore(metadata);
            scoredFiles.push({ filePath, score });
        }

        // Sort by score (lowest first = least important)
        scoredFiles.sort((a, b) => a.score - b.score);
        
        // Evict bottom 10% of files
        const toEvict = Math.floor(scoredFiles.length * 0.1);
        for (let i = 0; i < toEvict; i++) {
            this._invalidate(scoredFiles[i].filePath);
        }
    }

    private _calculateImportanceScore(metadata: CacheFileMetadata): number {
        const now = Date.now();
        const daysSinceAccess = (now - metadata.lastAccessed) / (1000 * 60 * 60 * 24);
        
        // Higher score = more important
        // Factors: analysis time (expensive files), complexity, recent access
        const timeScore = metadata.analysisTime / 1000; // Convert to seconds
        const complexityScore = metadata.complexity;
        const recencyScore = Math.max(0, 30 - daysSinceAccess); // Decay over 30 days
        
        return timeScore + complexityScore + recencyScore;
    }

    private _computeComplexity(entry: TypeCacheEntry): number {
        // Simple complexity metric based on symbols, types, and dependencies
        return entry.symbols.length + entry.types.length + entry.dependencies.length;
    }

    private _computeConfigHash(): string {
        const configData = {
            typeCheckingMode: this._configOptions.effectiveTypeCheckingMode,
            strictMode: this._configOptions.diagnosticRuleSet.strict,
            pythonVersion: this._configOptions.defaultPythonVersion,
            extraPaths: this._configOptions.defaultExtraPaths?.map(p => p.toString()),
        };
        
        return hashString(JSON.stringify(configData));
    }

    private _getCacheKey(filePath: string): string {
        return hashString(filePath);
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
        const extension = this._format === TypeCacheFormat.Json ? '.json' : '.cache';
        return `${key}${extension}`;
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
} 