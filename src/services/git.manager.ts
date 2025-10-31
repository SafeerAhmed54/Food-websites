/**
 * Git Manager for the auto-daily-commit system
 * Handles all Git operations with safety checks and error handling
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  GitManager as IGitManager,
  GitRepositoryState,
  FileChangeType,
  FileAnalysis,
  GitOperationError,
  GitOperationOptions
} from '../types';
import { defaultLogger } from '../utils/logger';
import { analyzeFiles } from '../utils/file-analyzer';

const execAsync = promisify(exec);

export class GitManager implements IGitManager {
  private repositoryPath: string;
  private timeout: number;

  constructor(repositoryPath: string = process.cwd(), timeout: number = 30000) {
    this.repositoryPath = repositoryPath;
    this.timeout = timeout;
  }

  /**
   * Check if there are uncommitted changes in the repository
   */
  async hasChanges(): Promise<boolean> {
    try {
      const { stdout } = await this.executeGitCommand('status --porcelain');
      return stdout.trim().length > 0;
    } catch (error) {
      defaultLogger.error('Failed to check for changes', { error: (error as Error).message });
      throw new GitOperationError(`Failed to check for changes: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Get list of changed files
   */
  async getChangedFiles(): Promise<string[]> {
    try {
      const { stdout } = await this.executeGitCommand('status --porcelain');
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);
      
      return lines.map(line => {
        // Git status format: XY filename
        // X = index status, Y = working tree status
        return line.substring(3).trim();
      });
    } catch (error) {
      defaultLogger.error('Failed to get changed files', { error: (error as Error).message });
      throw new GitOperationError(`Failed to get changed files: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Create a commit with the given message
   */
  async createCommit(message: string, options?: GitOperationOptions): Promise<string> {
    try {
      // Validate repository state before committing
      if (!await this.isRepositoryClean()) {
        throw new GitOperationError('Repository is not in a clean state for auto-commit');
      }

      // Check if there are actually changes to commit
      if (!await this.hasChanges()) {
        throw new GitOperationError('No changes to commit');
      }

      // Validate commit message
      if (!message || message.trim().length === 0) {
        throw new GitOperationError('Commit message cannot be empty');
      }

      const escapedMessage = this.escapeCommitMessage(message);
      
      // Add all changes (respecting .gitignore)
      defaultLogger.debug('Adding changes to staging area');
      await this.executeGitCommand('add .', options);
      
      // Verify that files were actually staged
      const { stdout: statusOutput } = await this.executeGitCommand('status --porcelain --cached');
      if (!statusOutput.trim()) {
        throw new GitOperationError('No files were staged for commit');
      }

      // Create the commit
      defaultLogger.debug('Creating commit', { message: escapedMessage });
      const { stdout } = await this.executeGitCommand(`commit -m "${escapedMessage}"`, options);
      
      // Extract commit hash
      const commitHash = await this.getLatestCommitHash();
      
      // Get the number of files changed
      const changedFiles = await this.getChangedFilesFromCommit(commitHash);
      
      defaultLogger.info('Successfully created commit', { 
        commitHash, 
        message: escapedMessage,
        filesChanged: changedFiles.length,
        timestamp: new Date().toISOString(),
        commitOutput: stdout.substring(0, 200) // First 200 chars of git output
      });
      
      return commitHash;
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      defaultLogger.error('Failed to create commit', { 
        error: errorMessage,
        message,
        repositoryPath: this.repositoryPath,
        timestamp: new Date().toISOString()
      });
      
      // If it's already a GitOperationError, re-throw it
      if (error instanceof GitOperationError) {
        throw error;
      }
      
      throw new GitOperationError(`Failed to create commit: ${errorMessage}`, error as Error);
    }
  }

  /**
   * Create a commit with retry logic for transient failures
   */
  async createCommitWithRetry(message: string, maxRetries: number = 3, retryDelayMs: number = 1000): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        defaultLogger.debug('Attempting to create commit', { attempt, maxRetries, message });
        return await this.createCommit(message);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry for certain types of errors
        if (error instanceof GitOperationError) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes('no changes') || 
              errorMessage.includes('empty') ||
              errorMessage.includes('not in a clean state')) {
            throw error; // Don't retry these errors
          }
        }
        
        if (attempt < maxRetries) {
          defaultLogger.warn('Commit attempt failed, retrying', { 
            attempt, 
            maxRetries, 
            error: (error as Error).message,
            retryDelayMs 
          });
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    
    // All retries failed
    throw new GitOperationError(
      `Failed to create commit after ${maxRetries} attempts: ${lastError?.message}`,
      lastError!
    );
  }

  /**
   * Check if repository is in a clean state (safe for auto-commit)
   */
  async isRepositoryClean(): Promise<boolean> {
    try {
      const state = await this.getRepositoryState();
      
      // Repository is clean if it's in normal state and not in the middle of operations
      return state === 'clean' || state === 'dirty';
    } catch (error) {
      defaultLogger.error('Failed to check repository state', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Generate a commit message based on changed files
   */
  generateCommitMessage(files: string[], customTemplate?: string): string {
    if (files.length === 0) {
      return 'chore: daily auto-commit (no changes detected)';
    }

    const analysis = analyzeFiles(files);
    
    // If custom template is provided, use it
    if (customTemplate) {
      return this.applyMessageTemplate(customTemplate, analysis, files);
    }
    
    // Default templates based on change type
    switch (analysis.changeType) {
      case 'code':
        return `feat: update application code (${files.length} files)`;
      case 'config':
        return `config: update configuration files (${files.length} files)`;
      case 'documentation':
        return `docs: update documentation (${files.length} files)`;
      case 'test':
        return `test: update test files (${files.length} files)`;
      case 'asset':
        return `assets: update static assets (${files.length} files)`;
      case 'dependency':
        return `deps: update dependencies (${files.length} files)`;
      case 'mixed':
      default:
        return `chore: daily auto-commit with multiple updates (${files.length} files)`;
    }
  }

  /**
   * Apply a custom message template with placeholders
   */
  private applyMessageTemplate(template: string, analysis: FileAnalysis, files: string[]): string {
    const now = new Date();
    const placeholders: Record<string, string> = {
      '{type}': analysis.changeType,
      '{count}': files.length.toString(),
      '{files}': files.length.toString(), // alias for count
      '{summary}': analysis.summary,
      '{date}': now.toISOString().split('T')[0], // YYYY-MM-DD
      '{time}': now.toTimeString().split(' ')[0], // HH:MM:SS
      '{timestamp}': now.toISOString(),
      '{day}': now.toLocaleDateString('en-US', { weekday: 'long' }),
      '{month}': now.toLocaleDateString('en-US', { month: 'long' }),
      '{year}': now.getFullYear().toString()
    };

    let message = template;
    
    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(placeholders)) {
      message = message.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    // Ensure message doesn't exceed reasonable length
    const maxLength = 72; // Git recommended first line length
    if (message.length > maxLength) {
      message = message.substring(0, maxLength - 3) + '...';
    }
    
    return message;
  }

  /**
   * Get the current repository state
   */
  private async getRepositoryState(): Promise<GitRepositoryState> {
    try {
      // Check if we're in a Git repository
      await this.executeGitCommand('rev-parse --git-dir');
      
      // Check for merge conflicts
      try {
        await this.executeGitCommand('diff --check');
      } catch (error) {
        if ((error as Error).message.includes('conflict')) {
          return 'conflict';
        }
      }

      // Check if we're in the middle of a merge
      const gitDir = await this.getGitDirectory();
      try {
        await fs.access(path.join(gitDir, 'MERGE_HEAD'));
        return 'merging';
      } catch {
        // Not merging
      }

      // Check if we're in the middle of a rebase
      try {
        await fs.access(path.join(gitDir, 'rebase-merge'));
        return 'rebasing';
      } catch {
        try {
          await fs.access(path.join(gitDir, 'rebase-apply'));
          return 'rebasing';
        } catch {
          // Not rebasing
        }
      }

      // Check if we're in detached HEAD state
      try {
        const { stdout } = await this.executeGitCommand('symbolic-ref -q HEAD');
        if (!stdout.trim()) {
          return 'detached';
        }
      } catch {
        return 'detached';
      }

      // Check if there are changes
      const hasChanges = await this.hasChanges();
      return hasChanges ? 'dirty' : 'clean';
      
    } catch (error) {
      defaultLogger.error('Failed to determine repository state', { error: (error as Error).message });
      return 'unknown';
    }
  }

  /**
   * Get the Git directory path
   */
  private async getGitDirectory(): Promise<string> {
    try {
      const { stdout } = await this.executeGitCommand('rev-parse --git-dir');
      const gitDir = stdout.trim();
      
      // If it's a relative path, make it absolute
      if (!path.isAbsolute(gitDir)) {
        return path.resolve(this.repositoryPath, gitDir);
      }
      
      return gitDir;
    } catch (error) {
      throw new GitOperationError(`Failed to get Git directory: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Get the latest commit hash
   */
  private async getLatestCommitHash(): Promise<string> {
    try {
      const { stdout } = await this.executeGitCommand('rev-parse HEAD');
      return stdout.trim();
    } catch (error) {
      throw new GitOperationError(`Failed to get latest commit hash: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Get the list of files changed in a specific commit
   */
  private async getChangedFilesFromCommit(commitHash: string): Promise<string[]> {
    try {
      const { stdout } = await this.executeGitCommand(`diff-tree --no-commit-id --name-only -r ${commitHash}`);
      return stdout.trim().split('\n').filter(line => line.length > 0);
    } catch (error) {
      defaultLogger.warn('Failed to get changed files from commit', { 
        commitHash, 
        error: (error as Error).message 
      });
      return []; // Return empty array if we can't get the files
    }
  }

  /**
   * Execute a Git command with proper error handling
   */
  private async executeGitCommand(command: string, options?: GitOperationOptions): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `git ${command}`;
    const execOptions = {
      cwd: this.repositoryPath,
      timeout: options?.timeout || this.timeout,
      maxBuffer: 1024 * 1024 // 1MB buffer
    };

    try {
      defaultLogger.debug('Executing Git command', { command: fullCommand, cwd: this.repositoryPath });
      
      const result = await execAsync(fullCommand, execOptions);
      
      defaultLogger.debug('Git command completed', { 
        command: fullCommand,
        stdout: result.stdout.substring(0, 200), // Log first 200 chars
        stderr: result.stderr.substring(0, 200)
      });
      
      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const stderr = error.stderr || '';
      const stdout = error.stdout || '';
      
      defaultLogger.error('Git command failed', {
        command: fullCommand,
        error: errorMessage,
        stderr,
        stdout,
        code: error.code
      });
      
      throw new Error(`Git command failed: ${errorMessage}\nstderr: ${stderr}\nstdout: ${stdout}`);
    }
  }

  /**
   * Escape commit message to prevent command injection
   */
  private escapeCommitMessage(message: string): string {
    // Remove or escape dangerous characters
    return message
      .replace(/"/g, '\\"')  // Escape double quotes
      .replace(/`/g, '\\`')  // Escape backticks
      .replace(/\$/g, '\\$') // Escape dollar signs
      .replace(/\n/g, ' ')   // Replace newlines with spaces
      .trim();
  }



  /**
   * Check if Git is available on the system
   */
  async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the current directory is a Git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.executeGitCommand('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository information for debugging
   */
  async getRepositoryInfo(): Promise<{
    isRepository: boolean;
    currentBranch?: string;
    lastCommit?: string;
    hasChanges: boolean;
    state: GitRepositoryState;
  }> {
    try {
      const isRepository = await this.isGitRepository();
      if (!isRepository) {
        return {
          isRepository: false,
          hasChanges: false,
          state: 'unknown'
        };
      }

      const [currentBranch, lastCommit, hasChanges, state] = await Promise.all([
        this.getCurrentBranch().catch(() => undefined),
        this.getLatestCommitHash().catch(() => undefined),
        this.hasChanges().catch(() => false),
        this.getRepositoryState()
      ]);

      return {
        isRepository: true,
        currentBranch,
        lastCommit,
        hasChanges,
        state
      };
    } catch (error) {
      defaultLogger.error('Failed to get repository info', { error: (error as Error).message });
      return {
        isRepository: false,
        hasChanges: false,
        state: 'unknown'
      };
    }
  }

  /**
   * Get the current branch name
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await this.executeGitCommand('branch --show-current');
      return stdout.trim();
    } catch (error) {
      // Fallback for older Git versions or detached HEAD
      try {
        const { stdout } = await this.executeGitCommand('rev-parse --abbrev-ref HEAD');
        return stdout.trim();
      } catch {
        throw new GitOperationError(`Failed to get current branch: ${(error as Error).message}`, error as Error);
      }
    }
  }

  /**
   * Set the repository path
   */
  setRepositoryPath(path: string): void {
    this.repositoryPath = path;
  }

  /**
   * Get the current repository path
   */
  getRepositoryPath(): string {
    return this.repositoryPath;
  }

  /**
   * Validate a commit hash exists in the repository
   */
  async validateCommitHash(commitHash: string): Promise<boolean> {
    try {
      await this.executeGitCommand(`cat-file -e ${commitHash}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get commit information
   */
  async getCommitInfo(commitHash: string): Promise<{
    hash: string;
    message: string;
    author: string;
    date: Date;
    filesChanged: string[];
  } | null> {
    try {
      // Get commit details
      const { stdout: commitInfo } = await this.executeGitCommand(
        `show --format="%H%n%s%n%an <%ae>%n%ci" --name-only ${commitHash}`
      );
      
      const lines = commitInfo.trim().split('\n');
      if (lines.length < 4) {
        return null;
      }
      
      const [hash, message, author, dateStr, ...files] = lines;
      
      return {
        hash: hash.trim(),
        message: message.trim(),
        author: author.trim(),
        date: new Date(dateStr.trim()),
        filesChanged: files.filter(file => file.trim().length > 0)
      };
    } catch (error) {
      defaultLogger.error('Failed to get commit info', { 
        commitHash, 
        error: (error as Error).message 
      });
      return null;
    }
  }

  /**
   * Get the last N commits
   */
  async getRecentCommits(count: number = 10): Promise<Array<{
    hash: string;
    message: string;
    author: string;
    date: Date;
  }>> {
    try {
      const { stdout } = await this.executeGitCommand(
        `log --format="%H|%s|%an <%ae>|%ci" -n ${count}`
      );
      
      return stdout.trim().split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          const [hash, message, author, dateStr] = line.split('|');
          return {
            hash: hash.trim(),
            message: message.trim(),
            author: author.trim(),
            date: new Date(dateStr.trim())
          };
        });
    } catch (error) {
      defaultLogger.error('Failed to get recent commits', { 
        count, 
        error: (error as Error).message 
      });
      return [];
    }
  }
}