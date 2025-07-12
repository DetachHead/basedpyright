/*
 * workspaceSymbolsCache.test.ts
 *
 * Tests for workspace symbols cache functionality.
 */

import { WorkspaceSymbolCache } from '../languageService/workspaceSymbolCache';
import { StandardConsole, LogLevel } from '../common/console';
import { Uri } from '../common/uri/uri';
import { createFromRealFileSystem, RealTempFile } from '../common/realFileSystem';
import { createServiceProvider } from '../common/serviceProviderExtensions';

describe('WorkspaceSymbolCache', () => {
    let console: StandardConsole;
    let cache: WorkspaceSymbolCache;
    let tempFile: RealTempFile;
    let serviceProvider: any;
    let fileSystem: any;

    beforeEach(() => {
        console = new StandardConsole(LogLevel.Info);
        tempFile = new RealTempFile();
        fileSystem = createFromRealFileSystem(tempFile);
        serviceProvider = createServiceProvider(fileSystem, console, tempFile);

        cache = new WorkspaceSymbolCache({
            verbose: true,
            console: console,
            maxFiles: 100,
        });
    });

    afterEach(() => {
        tempFile.dispose();
    });

    test('should configure cache with proper console logging', () => {
        const logSpy = jest.spyOn(console, 'info');

        cache.configure(true, 1000, true, false, console);

        expect(logSpy).toHaveBeenCalledWith(
            'Workspace symbols: Workspace symbols caching enabled (max 1000 files, verbose=true, debug=false)'
        );

        logSpy.mockRestore();
    });

    test('should report cache disabled when configured as disabled', () => {
        const logSpy = jest.spyOn(console, 'info');

        cache.configure(false, 1000, true, false, console);

        expect(logSpy).toHaveBeenCalledWith(
            'Workspace symbols: Workspace symbols caching disabled - cleared existing caches'
        );

        logSpy.mockRestore();
    });

    test('should detect cache folder existence at startup', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);

        // Test when no cache folder exists
        cache.checkCacheFolderAtStartup(mockWorkspaceRoot, fileSystem);

        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Workspace symbols: No workspace symbols cache found - will create at')
        );

        logSpy.mockRestore();
    });

    test('should use proper logging prefix for all messages', () => {
        const logSpy = jest.spyOn(console, 'info');

        cache.clearAllCaches();

        expect(logSpy).toHaveBeenCalledWith('Workspace symbols: Cleared all workspace symbol caches');

        logSpy.mockRestore();
    });

    test('should handle cache statistics correctly', () => {
        const stats = cache.getCacheStats();

        expect(stats).toHaveProperty('workspaceCount');
        expect(stats).toHaveProperty('totalFileCount');
        expect(stats).toHaveProperty('totalSymbolCount');
        expect(stats).toHaveProperty('averageSymbolsPerFile');
        expect(stats).toHaveProperty('cacheHitRate');
        expect(stats).toHaveProperty('memoryUsageMB');
        expect(stats).toHaveProperty('totalErrors');
        expect(stats).toHaveProperty('fallbackActive');

        expect(typeof stats.workspaceCount).toBe('number');
        expect(typeof stats.totalFileCount).toBe('number');
        expect(typeof stats.totalSymbolCount).toBe('number');
        expect(typeof stats.averageSymbolsPerFile).toBe('number');
        expect(typeof stats.cacheHitRate).toBe('number');
        expect(typeof stats.memoryUsageMB).toBe('number');
        expect(typeof stats.totalErrors).toBe('number');
        expect(typeof stats.fallbackActive).toBe('boolean');
    });

    test('should handle error conditions gracefully', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file('/nonexistent/path', serviceProvider);

        // This should not throw an error
        expect(() => {
            cache.checkCacheFolderAtStartup(mockWorkspaceRoot, fileSystem);
        }).not.toThrow();

        logSpy.mockRestore();
    });

    test('should use debug mode for invalidation logging', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);

        // Configure with debug mode enabled
        cache.configure(true, 1000, false, true, console);

        // Test invalidation with no cache - should log in debug mode
        cache.invalidate(mockWorkspaceRoot);

        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Workspace symbols [DEBUG]: Skipping invalidation for workspace')
        );

        logSpy.mockRestore();
    });

    test('should not log debug messages when debug mode is disabled', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);

        // Configure with debug mode disabled (default)
        cache.configure(true, 1000, false, false, console);

        // Test invalidation with no cache - should NOT log debug message
        cache.invalidate(mockWorkspaceRoot);

        expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));

        logSpy.mockRestore();
    });

    test('should track LRU cache access and provide memory usage stats', () => {
        const stats = cache.getCacheStats();

        expect(stats.memoryUsageMB).toBeGreaterThanOrEqual(0);
        expect(stats.totalErrors).toBe(0);
        expect(stats.fallbackActive).toBe(false);
    });

    test('should configure with LRU and error handling options', () => {
        const customCache = new WorkspaceSymbolCache({
            verbose: true,
            maxMemoryMB: 100,
            maxErrors: 50,
            console: console,
        });

        // This should not throw an error
        expect(() => {
            customCache.configure(true, 1000, true, false, console);
        }).not.toThrow();

        const stats = customCache.getCacheStats();
        expect(stats.memoryUsageMB).toBeGreaterThanOrEqual(0);
        expect(stats.totalErrors).toBe(0);
        expect(stats.fallbackActive).toBe(false);
    });

    test('should clear all caches including LRU tracking', () => {
        const logSpy = jest.spyOn(console, 'info');

        // This should clear all internal state
        cache.clearAllCaches();

        expect(logSpy).toHaveBeenCalledWith('Workspace symbols: Cleared all workspace symbol caches');

        const stats = cache.getCacheStats();
        expect(stats.workspaceCount).toBe(0);
        expect(stats.totalFileCount).toBe(0);
        expect(stats.totalSymbolCount).toBe(0);
        expect(stats.memoryUsageMB).toBe(0);
        expect(stats.totalErrors).toBe(0);
        expect(stats.fallbackActive).toBe(false);

        logSpy.mockRestore();
    });

    test('should handle batch invalidation properly', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);
        const mockFileUri = Uri.file(tempFile.tmpdir().getFilePath() + '/test.py', serviceProvider);

        // Configure with debug mode to see batch invalidation logs
        cache.configure(true, 1000, false, true, console);

        // Test multiple invalidations of the same file (should be deduplicated)
        cache.invalidate(mockWorkspaceRoot, mockFileUri);
        cache.invalidate(mockWorkspaceRoot, mockFileUri);
        cache.invalidate(mockWorkspaceRoot, mockFileUri);

        // Should log duplicate skip messages
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Workspace symbols [DEBUG]: Skipping duplicate invalidation for')
        );

        logSpy.mockRestore();
    });

    test('should flush pending invalidations immediately', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);
        const mockFileUri = Uri.file(tempFile.tmpdir().getFilePath() + '/test.py', serviceProvider);

        // Configure with debug mode
        cache.configure(true, 1000, false, true, console);

        // Add a pending invalidation
        cache.invalidate(mockWorkspaceRoot, mockFileUri);

        // Flush should process it immediately
        cache.flushPendingInvalidations();

        // Should have processed the batch
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Workspace symbols [DEBUG]: Skipping batch invalidation for workspace')
        );

        logSpy.mockRestore();
    });

    test('should handle performance optimizations for monorepos', () => {
        const customCache = new WorkspaceSymbolCache({
            verbose: false,
            debug: true,
            debounceMs: 25, // Faster responsiveness
            massInvalidationThreshold: 15, // Lower threshold for mass detection
            console: console,
        });

        // This should not throw an error
        expect(() => {
            customCache.configure(true, 1000, false, true, console);
        }).not.toThrow();

        const stats = customCache.getCacheStats();
        expect(stats.memoryUsageMB).toBeGreaterThanOrEqual(0);
        expect(stats.totalErrors).toBe(0);
        expect(stats.fallbackActive).toBe(false);
    });

    test('should skip non-indexable files for performance', () => {
        const logSpy = jest.spyOn(console, 'info');
        const mockWorkspaceRoot = Uri.file(tempFile.tmpdir().getFilePath(), serviceProvider);
        const mockBuildFile = Uri.file(tempFile.tmpdir().getFilePath() + '/build/output.js', serviceProvider);

        // Configure with debug mode to see skip messages
        cache.configure(true, 1000, false, true, console);

        // Try to invalidate a build file - should be skipped
        cache.invalidate(mockWorkspaceRoot, mockBuildFile);

        // Should log skip message
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Workspace symbols [DEBUG]: Skipping invalidation for non-indexable file')
        );

        logSpy.mockRestore();
    });
});
