/**
 * Scheduler Service for the auto-daily-commit system
 * Handles daily cron jobs with node-cron, missed execution handling,
 * and scheduler state persistence
 */

import * as cron from 'node-cron';
import { promises as fs } from 'fs';
import { join } from 'path';
import { 
  Scheduler as IScheduler, 
  SchedulerJob, 
  SchedulerError,
  Logger as ILogger 
} from '../types';
import { defaultLogger } from '../utils/logger';

interface SchedulerState {
  lastRun?: string; // ISO string
  nextRun?: string; // ISO string
  isActive: boolean;
  cronExpression: string;
  missedExecutions: string[]; // Array of ISO strings for missed executions
}

export class Scheduler implements IScheduler {
  private task: cron.ScheduledTask | null = null;
  private callback: (() => void) | null = null;
  private cronExpression: string = '';
  private logger: ILogger;
  private stateFilePath: string;
  private state: SchedulerState;

  constructor(
    logger?: ILogger,
    stateFilePath: string = './config/scheduler-state.json'
  ) {
    this.logger = logger || defaultLogger;
    this.stateFilePath = stateFilePath;
    this.state = {
      isActive: false,
      cronExpression: '',
      missedExecutions: []
    };
  }

  /**
   * Schedule a cron job with the given expression and callback
   */
  schedule(cronExpression: string, callback: () => void): void {
    try {
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new SchedulerError(`Invalid cron expression: ${cronExpression}`);
      }

      // Stop existing task if running
      this.stop();

      // Store callback and expression
      this.callback = callback;
      this.cronExpression = cronExpression;

      // Create the scheduled task
      this.task = cron.schedule(cronExpression, () => {
        this.logger.info('Executing scheduled task', { 
          cronExpression: this.cronExpression,
          timestamp: new Date().toISOString()
        });

        try {
          // Update state before execution
          this.updateLastRun();
          
          // Execute the callback
          callback();

          this.logger.info('Scheduled task completed successfully');
        } catch (error) {
          this.logger.error('Scheduled task execution failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      });

      // Update state
      this.state.cronExpression = cronExpression;
      this.state.isActive = false; // Will be set to true when started
      this.calculateNextRun();

      this.logger.info('Scheduler configured', {
        cronExpression,
        nextRun: this.state.nextRun
      });

    } catch (error) {
      const message = `Failed to schedule task: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, { cronExpression });
      throw new SchedulerError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Start the scheduled task
   */
  start(): void {
    if (!this.task) {
      throw new SchedulerError('No task scheduled. Call schedule() first.');
    }

    if (this.isRunning()) {
      this.logger.debug('Scheduler is already running');
      return;
    }

    try {
      this.task.start();
      this.state.isActive = true;
      this.calculateNextRun();
      
      this.logger.info('Scheduler started', {
        cronExpression: this.cronExpression,
        nextRun: this.state.nextRun
      });

      // Save state to file
      this.saveState().catch(error => {
        this.logger.error('Failed to save scheduler state', { error: error.message });
      });

    } catch (error) {
      const message = `Failed to start scheduler: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      throw new SchedulerError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Stop the scheduled task
   */
  stop(): void {
    if (this.task) {
      try {
        this.task.stop();
        this.task.destroy();
        this.task = null;
        this.state.isActive = false;
        
        this.logger.info('Scheduler stopped');

        // Save state to file
        this.saveState().catch(error => {
          this.logger.error('Failed to save scheduler state', { error: error.message });
        });

      } catch (error) {
        this.logger.error('Error stopping scheduler', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check if the scheduler is currently running
   */
  isRunning(): boolean {
    return this.task !== null && this.state.isActive;
  }

  /**
   * Get current scheduler job information
   */
  getJobInfo(): SchedulerJob {
    return {
      id: 'auto-commit-daily',
      cronExpression: this.cronExpression,
      nextRun: this.state.nextRun ? new Date(this.state.nextRun) : new Date(),
      lastRun: this.state.lastRun ? new Date(this.state.lastRun) : undefined,
      isActive: this.state.isActive
    };
  }

  /**
   * Update configuration with new cron expression
   */
  updateSchedule(cronExpression: string): void {
    if (cronExpression === this.cronExpression) {
      this.logger.debug('Cron expression unchanged, skipping update');
      return;
    }

    const wasRunning = this.isRunning();
    
    // Reschedule with new expression
    if (this.callback) {
      this.schedule(cronExpression, this.callback);
      
      if (wasRunning) {
        this.start();
      }
      
      this.logger.info('Scheduler updated with new cron expression', {
        oldExpression: this.cronExpression,
        newExpression: cronExpression
      });
    }
  }

  /**
   * Check for missed executions and handle them
   */
  async handleMissedExecutions(): Promise<boolean> {
    try {
      await this.loadState();

      if (!this.state.lastRun || !this.callback) {
        return false;
      }

      const lastRun = new Date(this.state.lastRun);
      const now = new Date();
      
      // Check if we should have run since the last execution
      const shouldHaveRun = this.shouldHaveRunSince(lastRun, now);
      
      if (shouldHaveRun) {
        this.logger.info('Detected missed execution, executing now', {
          lastRun: this.state.lastRun,
          currentTime: now.toISOString()
        });

        // Add to missed executions log
        this.state.missedExecutions.push(now.toISOString());
        
        // Keep only last 10 missed executions
        if (this.state.missedExecutions.length > 10) {
          this.state.missedExecutions = this.state.missedExecutions.slice(-10);
        }

        // Execute the callback
        try {
          this.callback();
          this.updateLastRun();
          await this.saveState();
          return true;
        } catch (error) {
          this.logger.error('Failed to execute missed callback', {
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to handle missed executions', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Initialize scheduler and handle startup behavior
   */
  async initialize(): Promise<void> {
    try {
      await this.loadState();
      
      // Handle missed executions on startup
      await this.handleMissedExecutions();
      
      this.logger.info('Scheduler initialized', {
        hasState: !!this.state.lastRun,
        lastRun: this.state.lastRun
      });
    } catch (error) {
      this.logger.error('Failed to initialize scheduler', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new SchedulerError(
        `Scheduler initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get missed executions history
   */
  getMissedExecutions(): Date[] {
    return this.state.missedExecutions.map(iso => new Date(iso));
  }

  /**
   * Clear missed executions history
   */
  clearMissedExecutions(): void {
    this.state.missedExecutions = [];
    this.saveState().catch(error => {
      this.logger.error('Failed to save state after clearing missed executions', {
        error: error.message
      });
    });
  }

  // Private helper methods

  /**
   * Calculate the next run time based on cron expression
   */
  private calculateNextRun(): void {
    if (!this.cronExpression) return;

    try {
      // Parse cron expression to calculate next run
      // This is a simplified calculation - in production you might want to use a more robust library
      const now = new Date();
      const nextRun = this.getNextCronDate(this.cronExpression, now);
      this.state.nextRun = nextRun.toISOString();
    } catch (error) {
      this.logger.error('Failed to calculate next run time', {
        error: error instanceof Error ? error.message : String(error),
        cronExpression: this.cronExpression
      });
    }
  }

  /**
   * Update the last run timestamp
   */
  private updateLastRun(): void {
    this.state.lastRun = new Date().toISOString();
    this.calculateNextRun();
  }

  /**
   * Determine if the scheduler should have run between two dates
   */
  private shouldHaveRunSince(lastRun: Date, currentTime: Date): boolean {
    if (!this.cronExpression) return false;

    try {
      // For daily commits, check if we've crossed a day boundary
      // This is a simplified check - assumes daily cron jobs
      const lastRunDate = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate());
      const currentDate = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
      
      return currentDate > lastRunDate;
    } catch (error) {
      this.logger.error('Error checking if should have run', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Simple next cron date calculation (simplified for daily jobs)
   */
  private getNextCronDate(cronExpression: string, fromDate: Date): Date {
    // This is a simplified implementation for daily cron jobs
    // In production, you'd want to use a proper cron parser library
    const parts = cronExpression.split(' ');
    
    if (parts.length !== 5) {
      throw new Error('Invalid cron expression format');
    }

    const [minute, hour] = parts;
    
    const next = new Date(fromDate);
    next.setSeconds(0);
    next.setMilliseconds(0);
    
    // Set the time
    if (minute !== '*') {
      next.setMinutes(parseInt(minute, 10));
    }
    if (hour !== '*') {
      next.setHours(parseInt(hour, 10));
    }
    
    // If the time has already passed today, move to tomorrow
    if (next <= fromDate) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  /**
   * Save scheduler state to file
   */
  private async saveState(): Promise<void> {
    try {
      const stateDir = join(this.stateFilePath, '..');
      await fs.mkdir(stateDir, { recursive: true });
      
      const stateJson = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.stateFilePath, stateJson, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save scheduler state', {
        error: error instanceof Error ? error.message : String(error),
        stateFilePath: this.stateFilePath
      });
    }
  }

  /**
   * Load scheduler state from file
   */
  private async loadState(): Promise<void> {
    try {
      const stateData = await fs.readFile(this.stateFilePath, 'utf-8');
      const loadedState = JSON.parse(stateData) as SchedulerState;
      
      // Merge with current state, preserving defaults
      this.state = {
        ...this.state,
        ...loadedState,
        missedExecutions: loadedState.missedExecutions || []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, use default state
        this.logger.debug('No scheduler state file found, using defaults');
      } else {
        this.logger.error('Failed to load scheduler state', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}