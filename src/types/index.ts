/**
 * Core type definitions for the auto-daily-commit system
 */

// Re-export validation utilities and constants
export * from './validation';
export * from './constants';

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Main auto-commit service interface
 */
export interface AutoCommitService {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  executeCommit(): Promise<CommitResult>;
  getStatus(): ServiceStatus;
}

/**
 * Git operations manager interface
 */
export interface GitManager {
  hasChanges(): Promise<boolean>;
  getChangedFiles(): Promise<string[]>;
  createCommit(message: string): Promise<string>;
  isRepositoryClean(): Promise<boolean>;
  generateCommitMessage(files: string[], customTemplate?: string): string;
}

/**
 * Scheduler service interface
 */
export interface Scheduler {
  schedule(cronExpression: string, callback: () => void): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * Configuration manager interface
 */
export interface ConfigManager {
  loadConfig(): Promise<AutoCommitConfig>;
  saveConfig(config: AutoCommitConfig): Promise<void>;
  validateConfig(config: Partial<AutoCommitConfig>): boolean;
  getDefaultConfig(): AutoCommitConfig;
}

/**
 * Logger interface
 */
export interface Logger {
  info(message: string, metadata?: Record<string, any>): void;
  debug(message: string, metadata?: Record<string, any>): void;
  error(message: string, metadata?: Record<string, any>): void;
  getLogEntries(days?: number): Promise<LogEntry[]>;
  setLogLevel(level: LogLevel): void;
}

// ============================================================================
// Data Models
// ============================================================================

/**
 * Result of a commit operation
 */
export interface CommitResult {
  success: boolean;
  commitHash?: string;
  message: string;
  timestamp: Date;
  filesChanged: number;
  error?: string;
}

/**
 * Current status of the auto-commit service
 */
export interface ServiceStatus {
  isRunning: boolean;
  lastCommit?: Date;
  nextScheduledCommit?: Date;
  totalCommits: number;
  lastError?: string;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Auto-commit configuration interface
 */
export interface AutoCommitConfig {
  enabled: boolean;
  commitTime: string; // cron format (e.g., "0 18 * * *" for 6 PM daily)
  messageTemplate: string;
  excludePatterns: string[];
  logLevel: LogLevel;
  repositoryPath?: string;
  maxCommitMessageLength: number;
  retryAttempts: number;
  retryDelayMs: number;
}

/**
 * Configuration validation schema
 */
export interface ConfigValidationSchema {
  enabled: {
    type: 'boolean';
    required: true;
  };
  commitTime: {
    type: 'string';
    required: true;
    pattern: string; // cron pattern regex
  };
  messageTemplate: {
    type: 'string';
    required: true;
    minLength: number;
    maxLength: number;
  };
  excludePatterns: {
    type: 'array';
    required: false;
    items: {
      type: 'string';
    };
  };
  logLevel: {
    type: 'string';
    required: true;
    enum: LogLevel[];
  };
  repositoryPath: {
    type: 'string';
    required: false;
  };
  maxCommitMessageLength: {
    type: 'number';
    required: true;
    min: number;
    max: number;
  };
  retryAttempts: {
    type: 'number';
    required: true;
    min: number;
    max: number;
  };
  retryDelayMs: {
    type: 'number';
    required: true;
    min: number;
  };
}

// ============================================================================
// Enums and Union Types
// ============================================================================

/**
 * Available log levels
 */
export type LogLevel = 'debug' | 'info' | 'error';

/**
 * Git repository states
 */
export type GitRepositoryState = 
  | 'clean'
  | 'dirty'
  | 'merging'
  | 'rebasing'
  | 'detached'
  | 'conflict'
  | 'unknown';

/**
 * File change types for commit message generation
 */
export type FileChangeType = 
  | 'code'
  | 'config'
  | 'documentation'
  | 'test'
  | 'asset'
  | 'dependency'
  | 'mixed';

/**
 * Service operation results
 */
export type OperationResult<T = void> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  code?: string;
};

// ============================================================================
// Utility Types
// ============================================================================

/**
 * File analysis result for commit message generation
 */
export interface FileAnalysis {
  changeType: FileChangeType;
  files: string[];
  summary: string;
}

/**
 * Git operation options
 */
export interface GitOperationOptions {
  dryRun?: boolean;
  force?: boolean;
  timeout?: number;
}

/**
 * Scheduler job information
 */
export interface SchedulerJob {
  id: string;
  cronExpression: string;
  nextRun: Date;
  lastRun?: Date;
  isActive: boolean;
}

/**
 * System health check result
 */
export interface HealthCheck {
  gitAvailable: boolean;
  repositoryValid: boolean;
  configValid: boolean;
  schedulerRunning: boolean;
  lastCommitAge?: number; // hours since last commit
  diskSpaceAvailable: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error types for better error handling
 */
export class AutoCommitError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AutoCommitError';
  }
}

export class GitOperationError extends AutoCommitError {
  constructor(message: string, cause?: Error) {
    super(message, 'GIT_OPERATION_ERROR', cause);
    this.name = 'GitOperationError';
  }
}

export class ConfigurationError extends AutoCommitError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
  }
}

export class SchedulerError extends AutoCommitError {
  constructor(message: string, cause?: Error) {
    super(message, 'SCHEDULER_ERROR', cause);
    this.name = 'SchedulerError';
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid LogLevel
 */
export function isLogLevel(value: any): value is LogLevel {
  return typeof value === 'string' && ['debug', 'info', 'error'].includes(value);
}

/**
 * Type guard to check if a value is a valid GitRepositoryState
 */
export function isGitRepositoryState(value: any): value is GitRepositoryState {
  return typeof value === 'string' && 
    ['clean', 'dirty', 'merging', 'rebasing', 'detached', 'conflict', 'unknown'].includes(value);
}

/**
 * Type guard to check if a value is a valid FileChangeType
 */
export function isFileChangeType(value: any): value is FileChangeType {
  return typeof value === 'string' && 
    ['code', 'config', 'documentation', 'test', 'asset', 'dependency', 'mixed'].includes(value);
}