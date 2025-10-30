import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { LogLevel, LogEntry, Logger as ILogger } from '../types';

/**
 * Structured logger with file output, rotation, and retention policies
 */
export class Logger implements ILogger {
  private logDir: string;
  private logLevel: LogLevel;
  private maxRetentionDays: number;
  private initialized: boolean = false;

  constructor(
    logDir: string = './logs',
    logLevel: LogLevel = 'info',
    maxRetentionDays: number = 30
  ) {
    this.logDir = logDir;
    this.logLevel = logLevel;
    this.maxRetentionDays = maxRetentionDays;
  }

  /**
   * Initialize the logger by ensuring log directory exists
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.initialized = true;
      
      // Clean up old log files on initialization
      await this.cleanupOldLogs();
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      throw error;
    }
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log an error message
   */
  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  /**
   * Core logging method that handles all log levels
   */
  private async log(level: LogLevel, message: string, metadata?: Record<string, any>): Promise<void> {
    // Check if this log level should be written
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      await this.initialize();

      const logEntry: LogEntry = {
        timestamp: new Date(),
        level,
        message,
        metadata
      };

      // Write to file
      await this.writeToFile(logEntry);

      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        this.logToConsole(logEntry);
      }
    } catch (error) {
      // Fallback to console if file logging fails
      console.error('Logger failed to write to file:', error);
      console.log(`[${level.toUpperCase()}] ${message}`, metadata);
    }
  }

  /**
   * Determine if a log level should be written based on current log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      error: 2
    };

    return levels[level] >= levels[this.logLevel];
  }

  /**
   * Write log entry to file with daily rotation
   */
  private async writeToFile(logEntry: LogEntry): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const logFileName = `auto-commit-${today}.log`;
    const logFilePath = join(this.logDir, logFileName);

    const logLine = JSON.stringify({
      timestamp: logEntry.timestamp.toISOString(),
      level: logEntry.level,
      message: logEntry.message,
      metadata: logEntry.metadata
    }) + '\n';

    try {
      await fs.appendFile(logFilePath, logLine, 'utf8');
    } catch (error) {
      // If file doesn't exist, create it
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await fs.writeFile(logFilePath, logLine, 'utf8');
      } else {
        throw error;
      }
    }
  }

  /**
   * Log to console for development environment
   */
  private logToConsole(logEntry: LogEntry): void {
    const timestamp = logEntry.timestamp.toISOString();
    const level = logEntry.level.toUpperCase().padEnd(5);
    const message = logEntry.message;
    const metadata = logEntry.metadata ? JSON.stringify(logEntry.metadata) : '';

    console.log(`[${timestamp}] ${level} ${message} ${metadata}`);
  }

  /**
   * Get log entries from the last N days
   */
  async getLogEntries(days: number = 7): Promise<LogEntry[]> {
    await this.initialize();

    const entries: LogEntry[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      // Read log files for the specified date range
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        
        const dateStr = date.toISOString().split('T')[0];
        const logFileName = `auto-commit-${dateStr}.log`;
        const logFilePath = join(this.logDir, logFileName);

        try {
          const content = await fs.readFile(logFilePath, 'utf8');
          const lines = content.trim().split('\n').filter(line => line.length > 0);

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              entries.push({
                timestamp: new Date(parsed.timestamp),
                level: parsed.level,
                message: parsed.message,
                metadata: parsed.metadata
              });
            } catch (parseError) {
              // Skip malformed log lines
              console.warn('Failed to parse log line:', line);
            }
          }
        } catch (fileError) {
          // File doesn't exist for this date, skip
          if ((fileError as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`Failed to read log file ${logFileName}:`, fileError);
          }
        }
      }
    } catch (error) {
      console.error('Failed to read log entries:', error);
    }

    // Sort by timestamp (newest first)
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clean up log files older than maxRetentionDays
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxRetentionDays);

      for (const file of files) {
        if (file.startsWith('auto-commit-') && file.endsWith('.log')) {
          // Extract date from filename: auto-commit-YYYY-MM-DD.log
          const dateMatch = file.match(/auto-commit-(\d{4}-\d{2}-\d{2})\.log/);
          if (dateMatch) {
            const fileDate = new Date(dateMatch[1]);
            if (fileDate < cutoffDate) {
              const filePath = join(this.logDir, file);
              await fs.unlink(filePath);
              console.log(`Cleaned up old log file: ${file}`);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Set the log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Get the log directory path
   */
  getLogDirectory(): string {
    return this.logDir;
  }

  /**
   * Check if logger is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force cleanup of old logs (can be called manually)
   */
  async forceCleanup(): Promise<void> {
    await this.initialize();
    await this.cleanupOldLogs();
  }
}

/**
 * Default logger instance for the application
 */
export const defaultLogger = new Logger();

/**
 * Create a logger instance with custom configuration
 */
export function createLogger(
  logDir?: string,
  logLevel?: LogLevel,
  maxRetentionDays?: number
): Logger {
  return new Logger(logDir, logLevel, maxRetentionDays);
}