/*
 * workspaceSymbolsCache.test.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
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

        expect(typeof stats.workspaceCount).toBe('number');
        expect(typeof stats.totalFileCount).toBe('number');
        expect(typeof stats.totalSymbolCount).toBe('number');
        expect(typeof stats.averageSymbolsPerFile).toBe('number');
        expect(typeof stats.cacheHitRate).toBe('number');
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
});
