/**
 * Service Manager - Singleton manager for the auto-commit service
 * Handles service lifecycle in the Next.js application
 */

import { AutoCommitService } from '../services/auto-commit.service';
import { createLogger } from '../utils/logger';

class ServiceManager {
  private static instance: ServiceManager | null = null;
  private service: AutoCommitService | null = null;
  private isShuttingDown: boolean = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  /**
   * Initialize and start the auto-commit service
   */
  async initialize(): Promise<void> {
    if (this.service) {
      console.log('[ServiceManager] Service already initialized');
      return;
    }

    try {
      // Check if service should be enabled based on environment
      const isEnabled = this.shouldEnableService();
      
      if (!isEnabled) {
        console.log('[ServiceManager] Service disabled by environment configuration');
        return;
      }

      console.log('[ServiceManager] Initializing auto-commit service');

      // Get configuration from environment variables
      const configPath = process.env.AUTO_COMMIT_CONFIG_PATH;
      const repositoryPath = process.env.AUTO_COMMIT_REPO_PATH || process.cwd();
      const logPath = process.env.AUTO_COMMIT_LOG_PATH || './logs';
      const logLevel = (process.env.AUTO_COMMIT_LOG_LEVEL as 'debug' | 'info' | 'error') || 'info';

      // Create logger
      const logger = createLogger(logPath, logLevel, 30);

      // Create service instance
      this.service = new AutoCommitService(
        configPath,
        repositoryPath,
        logger
      );

      // Initialize the service
      await this.service.initialize();
      logger.info('Auto-commit service initialized');

      // Start the service
      await this.service.start();
      logger.info('Auto-commit service started');

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

      console.log('[ServiceManager] Auto-commit service started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ServiceManager] Failed to initialize service:', errorMessage);
      
      // Don't throw - allow the app to continue even if auto-commit fails
      // This ensures the Next.js app can still run
    }
  }

  /**
   * Stop the auto-commit service
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      if (this.service) {
        console.log('[ServiceManager] Shutting down auto-commit service');
        await this.service.stop();
        console.log('[ServiceManager] Auto-commit service stopped');
        this.service = null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ServiceManager] Error during shutdown:', errorMessage);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Get the service instance
   */
  getService(): AutoCommitService | null {
    return this.service;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.service?.isRunning() || false;
  }

  /**
   * Determine if service should be enabled based on environment
   */
  private shouldEnableService(): boolean {
    // Check explicit disable flag
    if (process.env.AUTO_COMMIT_DISABLED === 'true') {
      return false;
    }

    // In development, enable by default
    if (process.env.NODE_ENV === 'development') {
      return process.env.AUTO_COMMIT_ENABLED !== 'false';
    }

    // In production, require explicit enable
    if (process.env.NODE_ENV === 'production') {
      return process.env.AUTO_COMMIT_ENABLED === 'true';
    }

    // Default to enabled for other environments
    return true;
  }

  /**
   * Setup handlers for graceful shutdown
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      console.log(`[ServiceManager] Received ${signal}, shutting down gracefully`);
      await this.shutdown();
      process.exit(0);
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('[ServiceManager] Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[ServiceManager] Unhandled rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }
}

// Export singleton instance getter
export const getServiceManager = () => ServiceManager.getInstance();

// Export initialization function for Next.js
export async function initializeAutoCommitService(): Promise<void> {
  const manager = getServiceManager();
  await manager.initialize();
}

// Export shutdown function for Next.js
export async function shutdownAutoCommitService(): Promise<void> {
  const manager = getServiceManager();
  await manager.shutdown();
}
