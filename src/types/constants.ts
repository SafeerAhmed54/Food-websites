/**
 * Constants used throughout the auto-commit system
 */

// ============================================================================
// File Patterns and Extensions
// ============================================================================

/**
 * File patterns for different change types
 */
export const FILE_PATTERNS = {
  CODE: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.vue',
    '**/*.py',
    '**/*.java',
    '**/*.cs',
    '**/*.cpp',
    '**/*.c',
    '**/*.h',
    '**/*.php',
    '**/*.rb',
    '**/*.go',
    '**/*.rs'
  ],
  CONFIG: [
    '**/*.json',
    '**/*.yaml',
    '**/*.yml',
    '**/*.toml',
    '**/*.ini',
    '**/*.conf',
    '**/.*rc',
    '**/.env*',
    '**/Dockerfile*',
    '**/docker-compose*'
  ],
  DOCUMENTATION: [
    '**/*.md',
    '**/*.txt',
    '**/*.rst',
    '**/*.adoc',
    '**/README*',
    '**/CHANGELOG*',
    '**/LICENSE*',
    '**/*.pdf'
  ],
  TEST: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/cypress/**',
    '**/e2e/**'
  ],
  ASSET: [
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.svg',
    '**/*.ico',
    '**/*.css',
    '**/*.scss',
    '**/*.sass',
    '**/*.less',
    '**/*.woff*',
    '**/*.ttf',
    '**/*.eot'
  ],
  DEPENDENCY: [
    '**/package.json',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
    '**/Cargo.toml',
    '**/Cargo.lock',
    '**/requirements.txt',
    '**/Pipfile*',
    '**/composer.json',
    '**/composer.lock'
  ]
} as const;

// ============================================================================
// Commit Message Templates
// ============================================================================

/**
 * Default commit message templates for different change types
 */
export const COMMIT_TEMPLATES = {
  CODE: 'feat: update application code',
  CONFIG: 'config: update configuration files',
  DOCUMENTATION: 'docs: update documentation',
  TEST: 'test: update tests',
  ASSET: 'style: update assets and styling',
  DEPENDENCY: 'deps: update dependencies',
  MIXED: 'chore: daily auto-commit with multiple updates'
} as const;

// ============================================================================
// System Limits and Timeouts
// ============================================================================

/**
 * System operation limits
 */
export const LIMITS = {
  MAX_COMMIT_MESSAGE_LENGTH: 200,
  MIN_COMMIT_MESSAGE_LENGTH: 20,
  MAX_RETRY_ATTEMPTS: 10,
  MIN_RETRY_DELAY_MS: 1000,
  MAX_LOG_RETENTION_DAYS: 30,
  MAX_FILES_IN_COMMIT_MESSAGE: 10,
  GIT_OPERATION_TIMEOUT_MS: 30000,
  CONFIG_VALIDATION_TIMEOUT_MS: 5000
} as const;

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standardized error codes for the system
 */
export const ERROR_CODES = {
  // Git related errors
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  GIT_REPOSITORY_NOT_FOUND: 'GIT_REPOSITORY_NOT_FOUND',
  GIT_OPERATION_FAILED: 'GIT_OPERATION_FAILED',
  GIT_MERGE_CONFLICT: 'GIT_MERGE_CONFLICT',
  GIT_DETACHED_HEAD: 'GIT_DETACHED_HEAD',
  GIT_PERMISSION_DENIED: 'GIT_PERMISSION_DENIED',
  
  // Configuration errors
  CONFIG_FILE_NOT_FOUND: 'CONFIG_FILE_NOT_FOUND',
  CONFIG_INVALID_FORMAT: 'CONFIG_INVALID_FORMAT',
  CONFIG_VALIDATION_FAILED: 'CONFIG_VALIDATION_FAILED',
  CONFIG_PERMISSION_DENIED: 'CONFIG_PERMISSION_DENIED',
  
  // Scheduler errors
  SCHEDULER_INVALID_CRON: 'SCHEDULER_INVALID_CRON',
  SCHEDULER_START_FAILED: 'SCHEDULER_START_FAILED',
  SCHEDULER_STOP_FAILED: 'SCHEDULER_STOP_FAILED',
  
  // Service errors
  SERVICE_ALREADY_RUNNING: 'SERVICE_ALREADY_RUNNING',
  SERVICE_NOT_INITIALIZED: 'SERVICE_NOT_INITIALIZED',
  SERVICE_INITIALIZATION_FAILED: 'SERVICE_INITIALIZATION_FAILED',
  
  // File system errors
  FILE_PERMISSION_DENIED: 'FILE_PERMISSION_DENIED',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',
  DISK_SPACE_INSUFFICIENT: 'DISK_SPACE_INSUFFICIENT'
} as const;

// ============================================================================
// Default Paths and Directories
// ============================================================================

/**
 * Default file and directory paths
 */
export const DEFAULT_PATHS = {
  CONFIG_FILE: './config/auto-commit.config.json',
  LOG_DIRECTORY: './logs',
  LOG_FILE_PREFIX: 'auto-commit',
  REPOSITORY_ROOT: './',
  GIT_DIRECTORY: '.git'
} as const;

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Environment variable names used by the system
 */
export const ENV_VARS = {
  CONFIG_PATH: 'AUTO_COMMIT_CONFIG_PATH',
  LOG_LEVEL: 'AUTO_COMMIT_LOG_LEVEL',
  REPOSITORY_PATH: 'AUTO_COMMIT_REPOSITORY_PATH',
  ENABLED: 'AUTO_COMMIT_ENABLED',
  COMMIT_TIME: 'AUTO_COMMIT_TIME'
} as const;

// ============================================================================
// Regular Expressions
// ============================================================================

/**
 * Common regular expressions used in the system
 */
export const REGEX_PATTERNS = {
  CRON_EXPRESSION: /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([12]?\d|3[01])) (\*|([0-9]|1[0-2])) (\*|[0-6])$/,
  GIT_HASH: /^[a-f0-9]{7,40}$/,
  COMMIT_MESSAGE_PLACEHOLDER: /\{(\w+)\}/g,
  FILE_EXTENSION: /\.([^.]+)$/,
  SEMANTIC_VERSION: /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
} as const;