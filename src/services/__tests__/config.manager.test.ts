/**
 * Unit tests for ConfigManager
 * Tests configuration file loading, validation, and environment variable overrides
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager } from '../config.manager';
import { AutoCommitConfig, ConfigurationError } from '../../types';
import { DEFAULT_CONFIG } from '../../types/validation';
import { ENV_VARS } from '../../types/constants';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env[ENV_VARS.CONFIG_PATH];
    delete process.env[ENV_VARS.ENABLED];
    delete process.env[ENV_VARS.LOG_LEVEL];
    delete process.env[ENV_VARS.REPOSITORY_PATH];
    delete process.env[ENV_VARS.COMMIT_TIME];
    
    configManager = new ConfigManager('./test-config.json');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load valid configuration from file', async () => {
      const validConfig: AutoCommitConfig = {
        ...DEFAULT_CONFIG,
        enabled: false,
        commitTime: '0 9 * * *'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      const result = await configManager.loadConfig();

      expect(result).toEqual(validConfig);
      expect(mockFs.readFile).toHaveBeenCalledWith('./test-config.json', 'utf-8');
    });

    it('should use default configuration when file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await configManager.loadConfig();

      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it('should throw ConfigurationError for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(configManager.loadConfig()).rejects.toThrow('Failed to load configuration');
    });

    it('should throw ConfigurationError for file read errors other than ENOENT', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFs.readFile.mockRejectedValue(error);

      await expect(configManager.loadConfig()).rejects.toThrow('Failed to load configuration');
      expect(mockFs.readFile).toHaveBeenCalledWith('./test-config.json', 'utf-8');
    });

    it('should validate configuration and throw error for invalid config', async () => {
      const invalidConfig = {
        enabled: 'not-a-boolean',
        commitTime: 'invalid-cron',
        messageTemplate: 'short'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow('Configuration validation failed');
    });

    it('should merge partial configuration with defaults', async () => {
      const partialConfig = {
        enabled: false,
        commitTime: '0 9 * * *'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(partialConfig));

      const result = await configManager.loadConfig();

      expect(result).toEqual({
        ...DEFAULT_CONFIG,
        enabled: false,
        commitTime: '0 9 * * *'
      });
    });
  });

  describe('environment variable overrides', () => {
    it('should override enabled setting from environment variable', async () => {
      process.env[ENV_VARS.ENABLED] = 'false';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.enabled).toBe(false);
    });

    it('should override log level from environment variable', async () => {
      process.env[ENV_VARS.LOG_LEVEL] = 'debug';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.logLevel).toBe('debug');
    });

    it('should override repository path from environment variable', async () => {
      process.env[ENV_VARS.REPOSITORY_PATH] = '/custom/path';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.repositoryPath).toBe('/custom/path');
    });

    it('should override commit time from environment variable', async () => {
      process.env[ENV_VARS.COMMIT_TIME] = '0 12 * * *';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.commitTime).toBe('0 12 * * *');
    });

    it('should handle boolean environment variables correctly', async () => {
      // Test various boolean representations
      const testCases = [
        { envValue: 'true', expected: true },
        { envValue: '1', expected: true },
        { envValue: 'false', expected: false },
        { envValue: '0', expected: false },
        { envValue: 'TRUE', expected: true },
        { envValue: 'FALSE', expected: false }
      ];

      for (const testCase of testCases) {
        process.env[ENV_VARS.ENABLED] = testCase.envValue;
        
        const fileConfig = { ...DEFAULT_CONFIG };
        mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

        const result = await configManager.loadConfig();
        expect(result.enabled).toBe(testCase.expected);
      }
    });

    it('should ignore invalid log level environment variables', async () => {
      process.env[ENV_VARS.LOG_LEVEL] = 'invalid-level';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.logLevel).toBe(DEFAULT_CONFIG.logLevel);
    });

    it('should apply multiple environment overrides simultaneously', async () => {
      process.env[ENV_VARS.ENABLED] = 'false';
      process.env[ENV_VARS.LOG_LEVEL] = 'error';
      process.env[ENV_VARS.COMMIT_TIME] = '0 6 * * *';
      
      const fileConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const result = await configManager.loadConfig();

      expect(result.enabled).toBe(false);
      expect(result.logLevel).toBe('error');
      expect(result.commitTime).toBe('0 6 * * *');
    });
  });

  describe('default configuration fallback', () => {
    it('should return default configuration when no file exists and no env overrides', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await configManager.loadConfig();

      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it('should merge environment overrides with defaults when no file exists', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      process.env[ENV_VARS.ENABLED] = 'false';
      process.env[ENV_VARS.LOG_LEVEL] = 'debug';

      const result = await configManager.loadConfig();

      expect(result).toEqual({
        ...DEFAULT_CONFIG,
        enabled: false,
        logLevel: 'debug'
      });
    });

    it('should use default config path when none provided', () => {
      const defaultManager = new ConfigManager();
      expect(defaultManager.getConfigPath()).toBe('./config/auto-commit.config.json');
    });

    it('should use environment config path when provided', () => {
      process.env[ENV_VARS.CONFIG_PATH] = '/custom/config.json';
      const envManager = new ConfigManager();
      expect(envManager.getConfigPath()).toBe('/custom/config.json');
    });
  });

  describe('configuration validation', () => {
    it('should validate configuration with all required fields', async () => {
      const validConfig: AutoCommitConfig = {
        enabled: true,
        commitTime: '0 18 * * *',
        messageTemplate: 'chore: daily auto-commit - {summary}',
        excludePatterns: ['node_modules/**'],
        logLevel: 'info',
        maxCommitMessageLength: 72,
        retryAttempts: 3,
        retryDelayMs: 5000
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      const result = await configManager.loadConfig();
      expect(result).toEqual(validConfig);
    });

    it('should reject configuration with invalid cron expression', async () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        commitTime: 'not-a-cron-expression'
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow('Configuration validation failed');
    });

    it('should reject configuration with invalid message template length', async () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        messageTemplate: 'short' // Too short
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow('Configuration validation failed');
    });

    it('should clamp retry attempts to valid range', async () => {
      const configWithNegativeRetry = {
        ...DEFAULT_CONFIG,
        retryAttempts: -1 // Will be clamped to 0
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(configWithNegativeRetry));

      const result = await configManager.loadConfig();
      expect(result.retryAttempts).toBe(0);
    });

    it('should clamp retry attempts above maximum', async () => {
      const configWithHighRetry = {
        ...DEFAULT_CONFIG,
        retryAttempts: 15 // Will be clamped to 10
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(configWithHighRetry));

      const result = await configManager.loadConfig();
      expect(result.retryAttempts).toBe(10);
    });
  });

  describe('caching behavior', () => {
    it('should cache loaded configuration', async () => {
      const validConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      // First call
      const result1 = await configManager.loadConfig();
      // Second call
      const result2 = await configManager.getCachedConfig();

      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should reload configuration when cache is cleared', async () => {
      const validConfig = { ...DEFAULT_CONFIG };
      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      // Load config
      await configManager.loadConfig();
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);

      // Reload config
      await configManager.reloadConfig();
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });
  });
});