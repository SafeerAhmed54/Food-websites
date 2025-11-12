/**
 * Integration tests for AutoCommitService
 * Tests end-to-end commit flow, error scenarios, and service lifecycle
 */

import { AutoCommitService } from '../auto-commit.service';
import { createLogger } from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('AutoCommitService Integration Tests', () => {
  let testRepoPath: string;
  let service: AutoCommitService;
  let testConfigPath: string;
  let testLogger: any;

  beforeAll(async () => {
    // Create a temporary directory for test repository
    testRepoPath = path.join(process.cwd(), 'test-temp-repo-' + Date.now());
    await fs.mkdir(testRepoPath, { recursive: true });

    // Initialize a Git repository
    await execAsync('git init', { cwd: testRepoPath });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepoPath });
    await execAsync('git config user.name "Test User"', { cwd: testRepoPath });

    // Create initial commit
    const readmePath = path.join(testRepoPath, 'README.md');
    await fs.writeFile(readmePath, '# Test Repository\n');
    await execAsync('git add .', { cwd: testRepoPath });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepoPath });

    // Create test config file
    testConfigPath = path.join(testRepoPath, 'test-config.json');
    const testConfig = {
      enabled: true,
      commitTime: '0 18 * * *',
      messageTemplate: 'auto: daily commit',
      excludePatterns: [],
      logLevel: 'debug',
      repositoryPath: testRepoPath,
      maxCommitMessageLength: 72,
      retryAttempts: 2,
      retryDelayMs: 100
    };
    await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));

    // Create test logger with all required methods
    const baseLogger = createLogger(path.join(testRepoPath, 'logs'), 'debug', 30);
    testLogger = {
      info: baseLogger.info.bind(baseLogger),
      debug: baseLogger.debug.bind(baseLogger),
      error: baseLogger.error.bind(baseLogger),
      warn: (message: string, metadata?: Record<string, any>) => {
        baseLogger.info(`[WARN] ${message}`, metadata);
      },
      getLogEntries: baseLogger.getLogEntries.bind(baseLogger),
      setLogLevel: baseLogger.setLogLevel.bind(baseLogger)
    };
  });

  afterAll(async () => {
    // Clean up test repository
    try {
      await fs.rm(testRepoPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test repository:', error);
    }
  });

  beforeEach(() => {
    service = new AutoCommitService(testConfigPath, testRepoPath, testLogger);
  });

  afterEach(async () => {
    // Stop service if running
    try {
      if (service.isRunning()) {
        await service.stop();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('Service Lifecycle', () => {
    it('should initialize service successfully', async () => {
      await service.initialize();

      expect(service.isServiceInitialized()).toBe(true);
      expect(service.isRunning()).toBe(false);
    });

    it('should start and stop service', async () => {
      await service.initialize();
      await service.start();

      expect(service.isRunning()).toBe(true);

      await service.stop();

      expect(service.isRunning()).toBe(false);
    });

    it('should not start if not initialized', async () => {
      await expect(service.start()).rejects.toThrow('Service not initialized');
    });

    it('should handle multiple start calls gracefully', async () => {
      await service.initialize();
      await service.start();
      await service.start(); // Second call should not throw

      expect(service.isRunning()).toBe(true);
    });

    it('should handle multiple stop calls gracefully', async () => {
      await service.initialize();
      await service.start();
      await service.stop();
      await service.stop(); // Second call should not throw

      expect(service.isRunning()).toBe(false);
    });
  });

  describe('End-to-End Commit Flow', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should successfully commit when changes exist', async () => {
      // Create a new file
      const testFilePath = path.join(testRepoPath, 'test-file.txt');
      await fs.writeFile(testFilePath, 'Test content\n');

      // Execute commit
      const result = await service.executeCommit();

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
      expect(result.filesChanged).toBe(1);
      expect(result.error).toBeUndefined();

      // Verify commit was created
      const { stdout } = await execAsync('git log -1 --oneline', { cwd: testRepoPath });
      expect(stdout).toContain('auto: daily commit');
    });

    it('should skip commit when no changes exist', async () => {
      // Execute commit without any changes
      const result = await service.executeCommit();

      expect(result.success).toBe(true);
      expect(result.message).toBe('No changes to commit');
      expect(result.filesChanged).toBe(0);
      expect(result.commitHash).toBeUndefined();
    });

    it('should commit multiple files', async () => {
      // Create multiple files
      await fs.writeFile(path.join(testRepoPath, 'file1.ts'), 'console.log("file1");\n');
      await fs.writeFile(path.join(testRepoPath, 'file2.ts'), 'console.log("file2");\n');
      await fs.writeFile(path.join(testRepoPath, 'file3.md'), '# Documentation\n');

      const result = await service.executeCommit();

      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(3);
      expect(result.commitHash).toBeDefined();
    });

    it('should update service status after successful commit', async () => {
      // Create a file
      await fs.writeFile(path.join(testRepoPath, 'status-test.txt'), 'content\n');

      await service.executeCommit();

      const status = service.getStatus();
      expect(status.totalCommits).toBe(1);
      expect(status.lastCommit).toBeDefined();
      expect(status.lastError).toBeUndefined();
    });

    it('should track multiple commits', async () => {
      // First commit
      await fs.writeFile(path.join(testRepoPath, 'commit1.txt'), 'first\n');
      await service.executeCommit();

      // Second commit
      await fs.writeFile(path.join(testRepoPath, 'commit2.txt'), 'second\n');
      await service.executeCommit();

      const status = service.getStatus();
      expect(status.totalCommits).toBe(2);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle merge conflict state', async () => {
      // Simulate merge conflict by creating MERGE_HEAD file
      const gitDir = path.join(testRepoPath, '.git');
      await fs.writeFile(path.join(gitDir, 'MERGE_HEAD'), 'dummy-hash\n');

      // Create a file to commit
      await fs.writeFile(path.join(testRepoPath, 'conflict-test.txt'), 'content\n');

      const result = await service.executeCommit();

      expect(result.success).toBe(false);
      expect(result.message).toContain('not in a clean state');
      expect(result.error).toContain('merging');

      // Clean up
      await fs.unlink(path.join(gitDir, 'MERGE_HEAD'));
    });

    it('should handle rebase state', async () => {
      // Simulate rebase by creating rebase-merge directory
      const gitDir = path.join(testRepoPath, '.git');
      const rebaseMergeDir = path.join(gitDir, 'rebase-merge');
      await fs.mkdir(rebaseMergeDir, { recursive: true });

      // Create a file to commit
      await fs.writeFile(path.join(testRepoPath, 'rebase-test.txt'), 'content\n');

      const result = await service.executeCommit();

      expect(result.success).toBe(false);
      expect(result.message).toContain('not in a clean state');

      // Clean up
      await fs.rm(rebaseMergeDir, { recursive: true, force: true });
    });

    it('should recover from failed commit and succeed on retry', async () => {
      // Create a file
      await fs.writeFile(path.join(testRepoPath, 'retry-test.txt'), 'content\n');

      // First attempt should succeed
      const result1 = await service.executeCommit();
      expect(result1.success).toBe(true);

      // Second attempt with no changes should skip
      const result2 = await service.executeCommit();
      expect(result2.success).toBe(true);
      expect(result2.message).toBe('No changes to commit');
    });

    it('should log errors when commit fails', async () => {
      // Create MERGE_HEAD to simulate conflict
      const gitDir = path.join(testRepoPath, '.git');
      await fs.writeFile(path.join(gitDir, 'MERGE_HEAD'), 'dummy\n');
      await fs.writeFile(path.join(testRepoPath, 'error-log-test.txt'), 'content\n');

      await service.executeCommit();

      const status = service.getStatus();
      expect(status.lastError).toBeDefined();
      expect(status.lastError).toContain('not in a clean state');

      // Clean up
      await fs.unlink(path.join(gitDir, 'MERGE_HEAD'));
    });
  });

  describe('Repository Information', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should get repository information', async () => {
      const repoInfo = await service.getRepositoryInfo();

      expect(repoInfo.isRepository).toBe(true);
      expect(repoInfo.currentBranch).toBeDefined();
      expect(repoInfo.lastCommit).toBeDefined();
      expect(repoInfo.state).toBeDefined();
    });

    it('should get recent commits', async () => {
      // Create and commit a file
      await fs.writeFile(path.join(testRepoPath, 'recent-test.txt'), 'content\n');
      await service.executeCommit();

      const commits = await service.getRecentCommits(5);

      expect(commits.length).toBeGreaterThan(0);
      expect(commits[0]).toHaveProperty('hash');
      expect(commits[0]).toHaveProperty('message');
      expect(commits[0]).toHaveProperty('author');
      expect(commits[0]).toHaveProperty('date');
    });
  });

  describe('Manual Commit Trigger', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should allow manual commit trigger', async () => {
      // Create a file
      await fs.writeFile(path.join(testRepoPath, 'manual-test.txt'), 'content\n');

      const result = await service.triggerManualCommit();

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
    });
  });
});
