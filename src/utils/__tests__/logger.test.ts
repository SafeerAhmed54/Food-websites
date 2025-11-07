/**
 * Unit tests for Logger
 * Tests log level filtering, file rotation behavior, and structured logging format
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../logger';
import { LogLevel, LogEntry } from '../../types';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Logger', () => {
  let logger: Logger;
  const testLogDir = './test-logs';
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Store and set environment
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'test';
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    
    // Mock successful directory creation
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    
    logger = new Logger(testLogDir, 'info', 30);
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    
    // Restore console methods
    jest.restoreAllMocks();
  });

  describe('log level filtering', () => {
    beforeEach(() => {
      mockFs.appendFile.mockResolvedValue(undefined);
    });

    it('should log info messages when log level is info', async () => {
      logger = new Logger(testLogDir, 'info');
      
      logger.info('Test info message');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalled();
      const callArgs = mockFs.appendFile.mock.calls[0];
      const logContent = JSON.parse(callArgs[1] as string);
      expect(logContent.level).toBe('info');
      expect(logContent.message).toBe('Test info message');
    });

    it('should log error messages when log level is info', async () => {
      logger = new Logger(testLogDir, 'info');
      
      logger.error('Test error message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalled();
      const callArgs = mockFs.appendFile.mock.calls[0];
      const logContent = JSON.parse(callArgs[1] as string);
      expect(logContent.level).toBe('error');
    });

    it('should not log debug messages when log level is info', async () => {
      logger = new Logger(testLogDir, 'info');
      
      logger.debug('Test debug message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).not.toHaveBeenCalled();
    });

    it('should log debug messages when log level is debug', async () => {
      logger = new Logger(testLogDir, 'debug');
      
      logger.debug('Test debug message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalled();
      const callArgs = mockFs.appendFile.mock.calls[0];
      const logContent = JSON.parse(callArgs[1] as string);
      expect(logContent.level).toBe('debug');
    });

    it('should only log error messages when log level is error', async () => {
      logger = new Logger(testLogDir, 'error');
      
      logger.info('Test info message');
      logger.debug('Test debug message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).not.toHaveBeenCalled();
      
      logger.error('Test error message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalledTimes(1);
    });

    it('should allow changing log level dynamically', async () => {
      logger = new Logger(testLogDir, 'info');
      
      logger.debug('Should not log');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockFs.appendFile).not.toHaveBeenCalled();
      
      logger.setLogLevel('debug');
      expect(logger.getLogLevel()).toBe('debug');
      
      logger.debug('Should log now');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockFs.appendFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('file rotation behavior', () => {
    beforeEach(() => {
      mockFs.appendFile.mockResolvedValue(undefined);
    });

    it('should create log files with daily rotation naming', async () => {
      const today = new Date().toISOString().split('T')[0];
      const expectedFileName = `auto-commit-${today}.log`;
      
      logger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalled();
      const filePath = mockFs.appendFile.mock.calls[0][0] as string;
      expect(filePath).toContain(expectedFileName);
    });

    it('should append to existing log file for same day', async () => {
      mockFs.appendFile.mockResolvedValue(undefined);
      
      logger.info('First message');
      logger.info('Second message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalledTimes(2);
      
      const firstCall = mockFs.appendFile.mock.calls[0][0];
      const secondCall = mockFs.appendFile.mock.calls[1][0];
      expect(firstCall).toBe(secondCall);
    });

    it('should clean up old log files on initialization', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days old
      const oldFileName = `auto-commit-${oldDate.toISOString().split('T')[0]}.log`;
      
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days old
      const recentFileName = `auto-commit-${recentDate.toISOString().split('T')[0]}.log`;
      
      mockFs.readdir.mockResolvedValue([oldFileName, recentFileName] as any);
      mockFs.unlink.mockResolvedValue(undefined);
      
      const newLogger = new Logger(testLogDir, 'info', 30);
      newLogger.info('Trigger initialization');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(path.join(testLogDir, oldFileName));
    });

    it('should not delete recent log files during cleanup', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);
      const recentFileName = `auto-commit-${recentDate.toISOString().split('T')[0]}.log`;
      
      mockFs.readdir.mockResolvedValue([recentFileName] as any);
      mockFs.unlink.mockResolvedValue(undefined);
      
      const newLogger = new Logger(testLogDir, 'info', 30);
      newLogger.info('Trigger initialization');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));
      
      const newLogger = new Logger(testLogDir, 'info', 30);
      newLogger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should still log despite cleanup failure
      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    it('should allow manual cleanup trigger', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      const oldFileName = `auto-commit-${oldDate.toISOString().split('T')[0]}.log`;
      
      mockFs.readdir.mockResolvedValue([oldFileName] as any);
      mockFs.unlink.mockResolvedValue(undefined);
      
      await logger.forceCleanup();
      
      expect(mockFs.unlink).toHaveBeenCalledWith(path.join(testLogDir, oldFileName));
    });
  });

  describe('structured logging format', () => {
    beforeEach(() => {
      mockFs.appendFile.mockResolvedValue(undefined);
    });

    it('should write logs in structured JSON format', async () => {
      logger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.appendFile).toHaveBeenCalled();
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logLine.trim());
      
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Test message');
    });

    it('should include metadata in structured format', async () => {
      const metadata = { userId: '123', action: 'commit' };
      
      logger.info('User action', metadata);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logLine.trim());
      
      expect(logEntry.metadata).toEqual(metadata);
    });

    it('should format timestamp as ISO string', async () => {
      logger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logLine.trim());
      
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(logEntry.timestamp)).not.toThrow();
    });

    it('should handle metadata with nested objects', async () => {
      const complexMetadata = {
        user: { id: '123', name: 'Test User' },
        files: ['file1.ts', 'file2.ts'],
        count: 42
      };
      
      logger.error('Complex error', complexMetadata);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logLine.trim());
      
      expect(logEntry.metadata).toEqual(complexMetadata);
    });

    it('should append newline to each log entry', async () => {
      logger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      expect(logLine.endsWith('\n')).toBe(true);
    });

    it('should handle messages without metadata', async () => {
      logger.info('Simple message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const logLine = mockFs.appendFile.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logLine.trim());
      
      expect(logEntry.metadata).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should fallback to console on file write failure', async () => {
      mockFs.appendFile.mockRejectedValue(new Error('Disk full'));
      
      logger.error('Test error');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(console.error).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });

    it('should create file if it does not exist', async () => {
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      
      mockFs.appendFile.mockRejectedValueOnce(enoentError);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      logger.info('Test message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      const newLogger = new Logger(testLogDir);
      
      // The info method doesn't return a promise, but the internal log does
      // We need to trigger it and wait
      newLogger.info('Test');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should have logged error to console
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('log retrieval', () => {
    it('should read and parse log entries from files', async () => {
      const today = new Date().toISOString().split('T')[0];
      const logFileName = `auto-commit-${today}.log`;
      
      const logContent = [
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'Message 1' }),
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'Message 2' })
      ].join('\n');
      
      mockFs.readdir.mockResolvedValue([logFileName] as any);
      mockFs.readFile.mockResolvedValue(logContent);
      
      const entries = await logger.getLogEntries(1);
      
      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('Message 2');
      expect(entries[1].message).toBe('Message 1');
    });

    it('should handle missing log files gracefully', async () => {
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      
      mockFs.readdir.mockResolvedValue([]);
      mockFs.readFile.mockRejectedValue(enoentError);
      
      const entries = await logger.getLogEntries(7);
      
      expect(entries).toEqual([]);
    });

    it('should skip malformed log lines', async () => {
      const today = new Date().toISOString().split('T')[0];
      const logFileName = `auto-commit-${today}.log`;
      
      const logContent = [
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'Valid' }),
        'invalid json line',
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'Also valid' })
      ].join('\n');
      
      mockFs.readdir.mockResolvedValue([logFileName] as any);
      mockFs.readFile.mockResolvedValue(logContent);
      
      const entries = await logger.getLogEntries(1);
      
      expect(entries).toHaveLength(2);
      expect(console.warn).toHaveBeenCalledWith('Failed to parse log line:', 'invalid json line');
    });
  });

  describe('logger configuration', () => {
    it('should use default values when not specified', () => {
      const defaultLogger = new Logger();
      
      expect(defaultLogger.getLogDirectory()).toBe('./logs');
      expect(defaultLogger.getLogLevel()).toBe('info');
    });

    it('should accept custom configuration', () => {
      const customLogger = new Logger('/custom/logs', 'debug', 60);
      
      expect(customLogger.getLogDirectory()).toBe('/custom/logs');
      expect(customLogger.getLogLevel()).toBe('debug');
    });

    it('should track initialization state', async () => {
      expect(logger.isInitialized()).toBe(false);
      
      logger.info('Initialize');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(logger.isInitialized()).toBe(true);
    });
  });
});
