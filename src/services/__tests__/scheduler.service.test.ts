/**
 * Unit tests for Scheduler Service
 * Tests cron job creation and execution, scheduler start/stop behavior,
 * and missed execution handling
 */

import * as cron from 'node-cron';
import * as fs from 'fs/promises';
import { Scheduler } from '../scheduler.service';
import { SchedulerError } from '../../types';

// Mock dependencies
jest.mock('node-cron');
jest.mock('fs/promises');

const mockCron = cron as jest.Mocked<typeof cron>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockLogger: any;
  let mockTask: any;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    };

    // Mock scheduled task
    mockTask = {
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn()
    };

    // Mock callback
    mockCallback = jest.fn();

    // Mock cron functions
    mockCron.validate.mockReturnValue(true);
    mockCron.schedule.mockReturnValue(mockTask as any);

    // Mock fs functions
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue({ code: 'ENOENT' } as any);

    scheduler = new Scheduler(mockLogger, './test-scheduler-state.json');
  });

  describe('cron job creation and execution', () => {
    it('should schedule a cron job with valid expression', () => {
      const cronExpression = '0 18 * * *';

      scheduler.schedule(cronExpression, mockCallback);

      expect(mockCron.validate).toHaveBeenCalledWith(cronExpression);
      expect(mockCron.schedule).toHaveBeenCalledWith(
        cronExpression,
        expect.any(Function),
        { scheduled: false }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduler configured',
        expect.objectContaining({ cronExpression })
      );
    });

    it('should throw SchedulerError for invalid cron expression', () => {
      mockCron.validate.mockReturnValue(false);

      expect(() => {
        scheduler.schedule('invalid-cron', mockCallback);
      }).toThrow('Invalid cron expression');
    });

    it('should execute callback when cron job triggers', () => {
      scheduler.schedule('0 18 * * *', mockCallback);

      // Get the scheduled callback
      const scheduledCallback = mockCron.schedule.mock.calls[0][1];
      
      // Execute it
      scheduledCallback();

      expect(mockCallback).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing scheduled task',
        expect.any(Object)
      );
    });

    it('should log error if callback throws during execution', () => {
      const error = new Error('Callback failed');
      mockCallback.mockImplementation(() => {
        throw error;
      });

      scheduler.schedule('0 18 * * *', mockCallback);

      // Get and execute the scheduled callback
      const scheduledCallback = mockCron.schedule.mock.calls[0][1];
      scheduledCallback();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Scheduled task execution failed',
        expect.objectContaining({
          error: 'Callback failed'
        })
      );
    });

    it('should stop existing task before scheduling new one', () => {
      scheduler.schedule('0 18 * * *', mockCallback);
      scheduler.start();

      // Schedule again
      scheduler.schedule('0 9 * * *', mockCallback);

      expect(mockTask.stop).toHaveBeenCalled();
      expect(mockTask.destroy).toHaveBeenCalled();
    });
  });

  describe('scheduler start/stop behavior', () => {
    beforeEach(() => {
      scheduler.schedule('0 18 * * *', mockCallback);
    });

    it('should start the scheduled task', () => {
      scheduler.start();

      expect(mockTask.start).toHaveBeenCalled();
      expect(scheduler.isRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduler started',
        expect.any(Object)
      );
    });

    it('should throw error when starting without scheduling first', () => {
      const newScheduler = new Scheduler(mockLogger);

      expect(() => {
        newScheduler.start();
      }).toThrow('No task scheduled');
    });

    it('should not start if already running', () => {
      scheduler.start();
      mockTask.start.mockClear();

      scheduler.start();

      expect(mockTask.start).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Scheduler is already running');
    });

    it('should stop the scheduled task', () => {
      scheduler.start();
      scheduler.stop();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(mockTask.destroy).toHaveBeenCalled();
      expect(scheduler.isRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduler stopped');
    });

    it('should handle stop when no task is scheduled', () => {
      const newScheduler = new Scheduler(mockLogger);
      
      // Should not throw
      expect(() => {
        newScheduler.stop();
      }).not.toThrow();
    });

    it('should return correct running status', () => {
      expect(scheduler.isRunning()).toBe(false);

      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should save state when starting', async () => {
      scheduler.start();

      // Wait for async state save
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should save state when stopping', async () => {
      scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      mockFs.writeFile.mockClear();
      scheduler.stop();

      // Wait for async state save
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('missed execution handling', () => {
    beforeEach(() => {
      scheduler.schedule('0 18 * * *', mockCallback);
    });

    it('should detect and execute missed runs on startup', async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const stateWithMissedRun = {
        lastRun: twoDaysAgo.toISOString(),
        isActive: false,
        cronExpression: '0 18 * * *',
        missedExecutions: []
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(stateWithMissedRun));

      const result = await scheduler.handleMissedExecutions();

      expect(result).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Detected missed execution, executing now',
        expect.any(Object)
      );
    });

    it('should not execute if no missed runs detected', async () => {
      const now = new Date();

      const stateWithRecentRun = {
        lastRun: now.toISOString(),
        isActive: false,
        cronExpression: '0 18 * * *',
        missedExecutions: []
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(stateWithRecentRun));

      const result = await scheduler.handleMissedExecutions();

      expect(result).toBe(false);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should return false when no previous state exists', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' } as any);

      const result = await scheduler.handleMissedExecutions();

      expect(result).toBe(false);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should log missed executions', async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const stateWithMissedRun = {
        lastRun: twoDaysAgo.toISOString(),
        isActive: false,
        cronExpression: '0 18 * * *',
        missedExecutions: []
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(stateWithMissedRun));

      await scheduler.handleMissedExecutions();

      const missedExecutions = scheduler.getMissedExecutions();
      expect(missedExecutions.length).toBeGreaterThan(0);
    });

    it('should limit missed executions history to 10 entries', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const existingMissed = Array(10).fill(null).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (i + 2));
        return date.toISOString();
      });

      const stateWithManyMissed = {
        lastRun: yesterday.toISOString(),
        isActive: false,
        cronExpression: '0 18 * * *',
        missedExecutions: existingMissed
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(stateWithManyMissed));

      await scheduler.handleMissedExecutions();

      const missedExecutions = scheduler.getMissedExecutions();
      expect(missedExecutions.length).toBeLessThanOrEqual(10);
    });

    it('should handle errors during missed execution gracefully', async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const stateWithMissedRun = {
        lastRun: twoDaysAgo.toISOString(),
        isActive: false,
        cronExpression: '0 18 * * *',
        missedExecutions: []
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(stateWithMissedRun));
      mockCallback.mockImplementation(() => {
        throw new Error('Execution failed');
      });

      await expect(scheduler.handleMissedExecutions()).rejects.toThrow('Execution failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to execute missed callback',
        expect.any(Object)
      );
    });

    it('should clear missed executions history', () => {
      scheduler.clearMissedExecutions();

      const missedExecutions = scheduler.getMissedExecutions();
      expect(missedExecutions).toEqual([]);
    });
  });

  describe('scheduler initialization', () => {
    it('should initialize and check for missed executions', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' } as any);

      await scheduler.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduler initialized',
        expect.any(Object)
      );
    });

    it('should handle initialization errors', async () => {
      const readError = new Error('Read error');
      mockFs.readFile.mockRejectedValue(readError);

      await expect(scheduler.initialize()).rejects.toThrow('Scheduler initialization failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize scheduler',
        expect.any(Object)
      );
    });
  });

  describe('job information', () => {
    it('should return job information', () => {
      scheduler.schedule('0 18 * * *', mockCallback);
      scheduler.start();

      const jobInfo = scheduler.getJobInfo();

      expect(jobInfo).toEqual({
        id: 'auto-commit-daily',
        cronExpression: '0 18 * * *',
        nextRun: expect.any(Date),
        lastRun: undefined,
        isActive: true
      });
    });

    it('should update schedule with new cron expression', () => {
      scheduler.schedule('0 18 * * *', mockCallback);
      scheduler.start();

      scheduler.updateSchedule('0 9 * * *');

      const jobInfo = scheduler.getJobInfo();
      expect(jobInfo.cronExpression).toBe('0 9 * * *');
    });

    it('should not update if cron expression is unchanged', () => {
      scheduler.schedule('0 18 * * *', mockCallback);
      
      mockCron.schedule.mockClear();
      scheduler.updateSchedule('0 18 * * *');

      expect(mockCron.schedule).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cron expression unchanged, skipping update'
      );
    });

    it('should restart scheduler after update if it was running', () => {
      scheduler.schedule('0 18 * * *', mockCallback);
      scheduler.start();

      mockTask.start.mockClear();
      scheduler.updateSchedule('0 9 * * *');

      expect(mockTask.start).toHaveBeenCalled();
    });
  });
});
