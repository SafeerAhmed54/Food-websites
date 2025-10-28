/**
 * Configuration validation schemas and utilities
 */

import { AutoCommitConfig, LogLevel, ConfigValidationSchema } from './index';

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Cron expression pattern for daily schedules
 */
export const CRON_PATTERN = /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([12]?\d|3[01])) (\*|([0-9]|1[0-2])) (\*|[0-6])$/;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AutoCommitConfig = {
  enabled: true,
  commitTime: '0 18 * * *', // 6 PM daily
  messageTemplate: 'chore: daily auto-commit - {summary}',
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    '*.log',
    '.env*',
    'dist/**',
    'build/**'
  ],
  logLevel: 'info',
  maxCommitMessageLength: 72,
  retryAttempts: 3,
  retryDelayMs: 5000
};

/**
 * Configuration validation schema
 */
export const CONFIG_VALIDATION_SCHEMA: ConfigValidationSchema = {
  enabled: {
    type: 'boolean',
    required: true
  },
  commitTime: {
    type: 'string',
    required: true,
    pattern: CRON_PATTERN.source
  },
  messageTemplate: {
    type: 'string',
    required: true,
    minLength: 10,
    maxLength: 200
  },
  excludePatterns: {
    type: 'array',
    required: false,
    items: {
      type: 'string'
    }
  },
  logLevel: {
    type: 'string',
    required: true,
    enum: ['debug', 'info', 'error']
  },
  repositoryPath: {
    type: 'string',
    required: false
  },
  maxCommitMessageLength: {
    type: 'number',
    required: true,
    min: 20,
    max: 200
  },
  retryAttempts: {
    type: 'number',
    required: true,
    min: 0,
    max: 10
  },
  retryDelayMs: {
    type: 'number',
    required: true,
    min: 1000
  }
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a complete configuration object
 */
export function validateConfig(config: Partial<AutoCommitConfig>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (typeof config.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (typeof config.commitTime !== 'string') {
    errors.push('commitTime must be a string');
  } else if (!CRON_PATTERN.test(config.commitTime)) {
    errors.push('commitTime must be a valid cron expression');
  }

  if (typeof config.messageTemplate !== 'string') {
    errors.push('messageTemplate must be a string');
  } else {
    if (config.messageTemplate.length < 10) {
      errors.push('messageTemplate must be at least 10 characters long');
    }
    if (config.messageTemplate.length > 200) {
      errors.push('messageTemplate must be no more than 200 characters long');
    }
  }

  if (config.excludePatterns !== undefined) {
    if (!Array.isArray(config.excludePatterns)) {
      errors.push('excludePatterns must be an array');
    } else {
      config.excludePatterns.forEach((pattern, index) => {
        if (typeof pattern !== 'string') {
          errors.push(`excludePatterns[${index}] must be a string`);
        }
      });
    }
  }

  if (typeof config.logLevel !== 'string') {
    errors.push('logLevel must be a string');
  } else if (!['debug', 'info', 'error'].includes(config.logLevel as LogLevel)) {
    errors.push('logLevel must be one of: debug, info, error');
  }

  if (config.repositoryPath !== undefined && typeof config.repositoryPath !== 'string') {
    errors.push('repositoryPath must be a string');
  }

  if (typeof config.maxCommitMessageLength !== 'number') {
    errors.push('maxCommitMessageLength must be a number');
  } else {
    if (config.maxCommitMessageLength < 20) {
      errors.push('maxCommitMessageLength must be at least 20');
    }
    if (config.maxCommitMessageLength > 200) {
      errors.push('maxCommitMessageLength must be no more than 200');
    }
  }

  if (typeof config.retryAttempts !== 'number') {
    errors.push('retryAttempts must be a number');
  } else {
    if (config.retryAttempts < 0) {
      errors.push('retryAttempts must be at least 0');
    }
    if (config.retryAttempts > 10) {
      errors.push('retryAttempts must be no more than 10');
    }
  }

  if (typeof config.retryDelayMs !== 'number') {
    errors.push('retryDelayMs must be a number');
  } else if (config.retryDelayMs < 1000) {
    errors.push('retryDelayMs must be at least 1000');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates a cron expression
 */
export function validateCronExpression(cronExpression: string): boolean {
  return CRON_PATTERN.test(cronExpression);
}

/**
 * Validates a log level
 */
export function validateLogLevel(logLevel: string): logLevel is LogLevel {
  return ['debug', 'info', 'error'].includes(logLevel);
}

/**
 * Merges partial configuration with defaults
 */
export function mergeWithDefaults(partialConfig: Partial<AutoCommitConfig>): AutoCommitConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partialConfig
  };
}

/**
 * Sanitizes configuration values
 */
export function sanitizeConfig(config: Partial<AutoCommitConfig>): Partial<AutoCommitConfig> {
  const sanitized: Partial<AutoCommitConfig> = { ...config };

  // Trim string values
  if (typeof sanitized.commitTime === 'string') {
    sanitized.commitTime = sanitized.commitTime.trim();
  }

  if (typeof sanitized.messageTemplate === 'string') {
    sanitized.messageTemplate = sanitized.messageTemplate.trim();
  }

  if (typeof sanitized.repositoryPath === 'string') {
    sanitized.repositoryPath = sanitized.repositoryPath.trim();
  }

  // Ensure excludePatterns is an array
  if (sanitized.excludePatterns && !Array.isArray(sanitized.excludePatterns)) {
    sanitized.excludePatterns = [];
  }

  // Clamp numeric values
  if (typeof sanitized.maxCommitMessageLength === 'number') {
    sanitized.maxCommitMessageLength = Math.max(20, Math.min(200, sanitized.maxCommitMessageLength));
  }

  if (typeof sanitized.retryAttempts === 'number') {
    sanitized.retryAttempts = Math.max(0, Math.min(10, sanitized.retryAttempts));
  }

  if (typeof sanitized.retryDelayMs === 'number') {
    sanitized.retryDelayMs = Math.max(1000, sanitized.retryDelayMs);
  }

  return sanitized;
}