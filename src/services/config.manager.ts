/**
 * Configuration Manager for the auto-daily-commit system
 * Handles loading, validation, and saving of configuration files
 * with environment variable overrides
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  AutoCommitConfig, 
  ConfigManager as IConfigManager,
  ConfigurationError 
} from '../types';
import { 
  DEFAULT_CONFIG, 
  validateConfig, 
  mergeWithDefaults, 
  sanitizeConfig 
} from '../types/validation';
import { DEFAULT_PATHS, ENV_VARS } from '../types/constants';

export class ConfigManager implements IConfigManager {
  private configPath: string;
  private cachedConfig: AutoCommitConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || process.env[ENV_VARS.CONFIG_PATH] || DEFAULT_PATHS.CONFIG_FILE;
  }

  /**
   * Loads configuration from file with environment variable overrides
   */
  async loadConfig(): Promise<AutoCommitConfig> {
    try {
      // Try to load from file first
      let fileConfig: Partial<AutoCommitConfig> = {};
      
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        fileConfig = JSON.parse(configData);
      } catch (error) {
        // If file doesn't exist, we'll use defaults
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new ConfigurationError(
            `Failed to read configuration file: ${(error as Error).message}`,
            error as Error
          );
        }
      }

      // Apply environment variable overrides
      const envOverrides = this.getEnvironmentOverrides();
      const mergedConfig = { ...fileConfig, ...envOverrides };

      // Sanitize and validate the configuration
      const sanitizedConfig = sanitizeConfig(mergedConfig);
      const fullConfig = mergeWithDefaults(sanitizedConfig);

      const validation = validateConfig(fullConfig);
      if (!validation.isValid) {
        throw new ConfigurationError(
          `Configuration validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Cache the validated configuration
      this.cachedConfig = fullConfig;
      return fullConfig;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to load configuration: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Saves configuration to file
   */
  async saveConfig(config: AutoCommitConfig): Promise<void> {
    try {
      // Validate the configuration before saving
      const validation = validateConfig(config);
      if (!validation.isValid) {
        throw new ConfigurationError(
          `Cannot save invalid configuration: ${validation.errors.join(', ')}`
        );
      }

      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Save the configuration
      const configJson = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configJson, 'utf-8');

      // Update cached configuration
      this.cachedConfig = config;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to save configuration: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Validates a configuration object
   */
  validateConfig(config: Partial<AutoCommitConfig>): boolean {
    const validation = validateConfig(config);
    return validation.isValid;
  }

  /**
   * Returns the default configuration
   */
  getDefaultConfig(): AutoCommitConfig {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Gets environment variable overrides
   */
  private getEnvironmentOverrides(): Partial<AutoCommitConfig> {
    const overrides: Partial<AutoCommitConfig> = {};

    // Check for enabled override
    if (process.env[ENV_VARS.ENABLED]) {
      const enabled = process.env[ENV_VARS.ENABLED]!.toLowerCase();
      overrides.enabled = enabled === 'true' || enabled === '1';
    }

    // Check for log level override
    if (process.env[ENV_VARS.LOG_LEVEL]) {
      const logLevel = process.env[ENV_VARS.LOG_LEVEL]!.toLowerCase();
      if (['debug', 'info', 'error'].includes(logLevel)) {
        overrides.logLevel = logLevel as 'debug' | 'info' | 'error';
      }
    }

    // Check for repository path override
    if (process.env[ENV_VARS.REPOSITORY_PATH]) {
      overrides.repositoryPath = process.env[ENV_VARS.REPOSITORY_PATH];
    }

    // Check for commit time override
    if (process.env[ENV_VARS.COMMIT_TIME]) {
      overrides.commitTime = process.env[ENV_VARS.COMMIT_TIME];
    }

    return overrides;
  }

  /**
   * Creates a default configuration file if it doesn't exist
   */
  async ensureConfigFile(): Promise<void> {
    try {
      await fs.access(this.configPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create it with defaults
        await this.saveConfig(this.getDefaultConfig());
      }
    }
  }

  /**
   * Gets the current configuration path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Reloads configuration from file, clearing cache
   */
  async reloadConfig(): Promise<AutoCommitConfig> {
    this.cachedConfig = null;
    return this.loadConfig();
  }

  /**
   * Gets cached configuration if available, otherwise loads from file
   */
  async getCachedConfig(): Promise<AutoCommitConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    return this.loadConfig();
  }
}