/**
 * Auto-Commit Service - Main orchestrator for the auto-daily-commit system
 * Coordinates all components: GitManager, Scheduler, ConfigManager, and Logger
 */

import { 
  AutoCommitService as IAutoCommitService,
  CommitResult,
  ServiceStatus,
  AutoCommitConfig,
  Logger as ILogger,
  ConfigurationError,
  GitOperationError,
  SchedulerError
} from '../types';
import { GitManager } from './git.manager';
import { Scheduler } from './scheduler.service';
import { ConfigManager } from './config.manager';
import { defaultLogger, createLogger } from '../utils/logger';

export class AutoCommitService implements IAutoCommitService {
  private gitManager: GitManager;
  private scheduler: Scheduler;
  private configManager: ConfigManager;
  private logger: ILogger;
  private config: AutoCommitConfig | null = null;
  private isInitialized: boolean = false;
  private isServiceRunning: boolean = false;
  private totalCommits: number = 0;
  private lastCommitDate: Date | undefined;
  private lastError: string | undefined;

  constructor(
    configPath?: string,
    repositoryPath?: string,
    logger?: ILogger
  ) {
    // Initialize configuration manager
    this.configManager = new ConfigManager(configPath);
    
    // Initialize Git manager (will be configured after loading config)
    this.gitManager = new GitManager(repositoryPath);
    
    // Initialize logger (will be reconfigured after loading config)
    this.logger = logger || defaultLogger;
    
    // Initialize scheduler (will be configured after loading config)
    this.scheduler = new Scheduler(this.logger);
  }

  /**
   * Initialize the auto-commit service
   * Loads configuration, validates Git repository, and prepares all components
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing auto-commit service');

      // Load configuration
      this.config = await this.configManager.loadConfig();
      this.logger.info('Configuration loaded successfully', {
        enabled: this.config.enabled,
        commitTime: this.config.commitTime,
        repositoryPath: this.config.repositoryPath
      });

      // Reconfigure logger with config settings
      if (this.logger === defaultLogger) {
        this.logger = createLogger(
          './test-logs',
          this.config.logLevel,
          30
        );
      }
      this.logger.setLogLevel(this.config.logLevel);

      // Configure Git manager with repository path from config
      if (this.config.repositoryPath) {
        this.gitManager.setRepositoryPath(this.config.repositoryPath);
      }

      // Validate Git is available
      const gitAvailable = await this.gitManager.isGitAvailable();
      if (!gitAvailable) {
        throw new ConfigurationError('Git is not available on this system');
      }
      this.logger.debug('Git is available');

      // Validate repository
      const isRepository = await this.gitManager.isGitRepository();
      if (!isRepository) {
        throw new ConfigurationError(
          `Not a Git repository: ${this.gitManager.getRepositoryPath()}`
        );
      }
      this.logger.debug('Git repository validated', {
        path: this.gitManager.getRepositoryPath()
      });

      // Get repository information for logging
      const repoInfo = await this.gitManager.getRepositoryInfo();
      this.logger.info('Repository information', repoInfo);

      // Initialize scheduler
      await this.scheduler.initialize();
      this.logger.debug('Scheduler initialized');

      // Handle missed executions on startup
      const hadMissedExecution = await this.scheduler.handleMissedExecutions();
      if (hadMissedExecution) {
        this.logger.info('Handled missed execution on startup');
      }

      this.isInitialized = true;
      this.logger.info('Auto-commit service initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      this.logger.error('Failed to initialize auto-commit service', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Start the auto-commit service
   * Begins the scheduled daily commits
   */
  async start(): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized. Call initialize() first.');
      }

      if (!this.config) {
        throw new ConfigurationError('Configuration not loaded');
      }

      if (!this.config.enabled) {
        this.logger.info('Auto-commit service is disabled in configuration');
        return;
      }

      if (this.isServiceRunning) {
        this.logger.debug('Service is already running');
        return;
      }

      this.logger.info('Starting auto-commit service', {
        commitTime: this.config.commitTime,
        repositoryPath: this.gitManager.getRepositoryPath()
      });

      // Schedule the daily commit job
      this.scheduler.schedule(
        this.config.commitTime,
        () => this.executeCommit()
      );

      // Start the scheduler
      this.scheduler.start();

      this.isServiceRunning = true;
      
      const jobInfo = this.scheduler.getJobInfo();
      this.logger.info('Auto-commit service started successfully', {
        nextRun: jobInfo.nextRun,
        cronExpression: jobInfo.cronExpression
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      this.logger.error('Failed to start auto-commit service', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Stop the auto-commit service
   * Stops the scheduler and cleans up resources
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping auto-commit service');

      if (!this.isServiceRunning) {
        this.logger.debug('Service is not running');
        return;
      }

      // Stop the scheduler
      this.scheduler.stop();

      this.isServiceRunning = false;
      this.logger.info('Auto-commit service stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      this.logger.error('Failed to stop auto-commit service', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Execute a commit operation
   * This is the main workflow that orchestrates the commit process
   */
  async executeCommit(): Promise<CommitResult> {
    const startTime = new Date();
    
    this.logger.info('Starting commit execution', {
      timestamp: startTime.toISOString()
    });

    try {
      if (!this.config) {
        throw new ConfigurationError('Configuration not loaded');
      }

      // Step 1: Check if there are any changes to commit
      this.logger.debug('Checking for uncommitted changes');
      const hasChanges = await this.gitManager.hasChanges();
      
      if (!hasChanges) {
        this.logger.info('No changes to commit, skipping');
        return {
          success: true,
          message: 'No changes to commit',
          timestamp: startTime,
          filesChanged: 0
        };
      }

      this.logger.debug('Changes detected, proceeding with commit');

      // Step 2: Verify repository is in a clean state (safe for auto-commit)
      this.logger.debug('Checking repository state');
      const isClean = await this.gitManager.isRepositoryClean();
      
      if (!isClean) {
        const repoInfo = await this.gitManager.getRepositoryInfo();
        const warningMessage = `Repository is not in a clean state (${repoInfo.state}), skipping auto-commit`;
        
        this.logger.warn(warningMessage, {
          state: repoInfo.state,
          currentBranch: repoInfo.currentBranch
        });
        
        this.lastError = warningMessage;
        
        return {
          success: false,
          message: warningMessage,
          timestamp: startTime,
          filesChanged: 0,
          error: `Repository state: ${repoInfo.state}`
        };
      }

      // Step 3: Get the list of changed files
      this.logger.debug('Getting list of changed files');
      const changedFiles = await this.gitManager.getChangedFiles();
      
      this.logger.info('Changed files detected', {
        count: changedFiles.length,
        files: changedFiles.slice(0, 10) // Log first 10 files
      });

      // Step 4: Generate commit message
      this.logger.debug('Generating commit message');
      const commitMessage = this.gitManager.generateCommitMessage(
        changedFiles,
        this.config.messageTemplate
      );
      
      this.logger.info('Commit message generated', {
        message: commitMessage,
        filesCount: changedFiles.length
      });

      // Step 5: Create the commit with retry logic
      this.logger.debug('Creating commit', {
        message: commitMessage,
        retryAttempts: this.config.retryAttempts,
        retryDelayMs: this.config.retryDelayMs
      });

      let commitHash: string;
      try {
        commitHash = await this.gitManager.createCommitWithRetry(
          commitMessage,
          this.config.retryAttempts,
          this.config.retryDelayMs
        );
      } catch (error) {
        // If commit fails, log detailed error
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.logger.error('Failed to create commit', {
          error: errorMessage,
          message: commitMessage,
          filesChanged: changedFiles.length,
          stack: error instanceof Error ? error.stack : undefined
        });

        this.lastError = errorMessage;

        return {
          success: false,
          message: commitMessage,
          timestamp: startTime,
          filesChanged: changedFiles.length,
          error: errorMessage
        };
      }

      // Step 6: Update service state and log success
      this.totalCommits++;
      this.lastCommitDate = startTime;
      this.lastError = undefined;

      const result: CommitResult = {
        success: true,
        commitHash,
        message: commitMessage,
        timestamp: startTime,
        filesChanged: changedFiles.length
      };

      this.logger.info('Commit created successfully', {
        commitHash,
        message: commitMessage,
        filesChanged: changedFiles.length,
        totalCommits: this.totalCommits,
        duration: Date.now() - startTime.getTime()
      });

      return result;

    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Unexpected error during commit execution', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime.getTime()
      });

      this.lastError = errorMessage;

      return {
        success: false,
        message: 'Commit execution failed',
        timestamp: startTime,
        filesChanged: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Get the current status of the service
   */
  getStatus(): ServiceStatus {
    const jobInfo = this.scheduler.getJobInfo();
    
    return {
      isRunning: this.isServiceRunning,
      lastCommit: this.lastCommitDate,
      nextScheduledCommit: jobInfo.nextRun,
      totalCommits: this.totalCommits,
      lastError: this.lastError
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): AutoCommitConfig | null {
    return this.config;
  }

  /**
   * Update the configuration and apply changes
   */
  async updateConfig(newConfig: Partial<AutoCommitConfig>): Promise<void> {
    try {
      if (!this.config) {
        throw new ConfigurationError('Configuration not loaded');
      }

      this.logger.info('Updating configuration', { changes: newConfig });

      // Merge with existing config
      const updatedConfig = { ...this.config, ...newConfig };

      // Validate the new configuration
      if (!this.configManager.validateConfig(updatedConfig)) {
        throw new ConfigurationError('Invalid configuration');
      }

      // Save the configuration
      await this.configManager.saveConfig(updatedConfig);

      // Apply configuration changes
      const wasRunning = this.isServiceRunning;
      
      if (wasRunning) {
        await this.stop();
      }

      this.config = updatedConfig;

      // Update logger level
      this.logger.setLogLevel(updatedConfig.logLevel);

      // Update Git manager repository path if changed
      if (newConfig.repositoryPath) {
        this.gitManager.setRepositoryPath(newConfig.repositoryPath);
      }

      // Update scheduler if commit time changed
      if (newConfig.commitTime && newConfig.commitTime !== this.config.commitTime) {
        this.scheduler.updateSchedule(newConfig.commitTime);
      }

      if (wasRunning && updatedConfig.enabled) {
        await this.start();
      }

      this.logger.info('Configuration updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      this.logger.error('Failed to update configuration', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Check if the service is initialized
   */
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if the service is running
   */
  isRunning(): boolean {
    return this.isServiceRunning;
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo() {
    return this.gitManager.getRepositoryInfo();
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(count: number = 10) {
    return this.gitManager.getRecentCommits(count);
  }

  /**
   * Get missed executions from scheduler
   */
  getMissedExecutions(): Date[] {
    return this.scheduler.getMissedExecutions();
  }

  /**
   * Manually trigger a commit (for testing or manual execution)
   */
  async triggerManualCommit(): Promise<CommitResult> {
    this.logger.info('Manual commit triggered');
    return this.executeCommit();
  }
}
