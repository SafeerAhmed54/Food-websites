/**
 * Unit tests for GitManager
 * Tests commit message generation logic and core functionality
 */

import { GitManager } from '../git.manager';
import { analyzeFiles } from '../../utils/file-analyzer';

// Mock the file analyzer
jest.mock('../../utils/file-analyzer');

describe('GitManager', () => {
  let gitManager: GitManager;

  beforeEach(() => {
    jest.clearAllMocks();
    gitManager = new GitManager('/test/repo');
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateCommitMessage', () => {
    it('should generate code commit message for code files', () => {
      const files = ['src/app.ts', 'src/utils.ts', 'src/components/Button.tsx'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '3 code'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('feat: update application code (3 files)');
      expect(analyzeFiles).toHaveBeenCalledWith(files);
    });

    it('should generate config commit message for config files', () => {
      const files = ['config.json', '.env', 'settings.yaml'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'config',
        files,
        summary: '3 config'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('config: update configuration files (3 files)');
    });

    it('should generate docs commit message for documentation files', () => {
      const files = ['README.md', 'docs/guide.md', 'CHANGELOG.md'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'documentation',
        files,
        summary: '3 documentation'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('docs: update documentation (3 files)');
    });

    it('should generate test commit message for test files', () => {
      const files = ['src/__tests__/app.test.ts', 'src/utils.spec.ts'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'test',
        files,
        summary: '2 test'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('test: update test files (2 files)');
    });

    it('should generate asset commit message for asset files', () => {
      const files = ['public/logo.png', 'styles/main.css'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'asset',
        files,
        summary: '2 asset'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('assets: update static assets (2 files)');
    });

    it('should generate dependency commit message for dependency files', () => {
      const files = ['package.json', 'package-lock.json'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'dependency',
        files,
        summary: '2 dependency'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('deps: update dependencies (2 files)');
    });

    it('should generate mixed commit message for diverse file types', () => {
      const files = ['src/app.ts', 'README.md', 'config.json', 'test.spec.ts'];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'mixed',
        files,
        summary: '4 files'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('chore: daily auto-commit with multiple updates (4 files)');
    });

    it('should generate default message for empty file list', () => {
      const files: string[] = [];
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'mixed',
        files: [],
        summary: 'no changes'
      });

      const message = gitManager.generateCommitMessage(files);

      expect(message).toBe('chore: daily auto-commit (no changes detected)');
    });

    it('should apply custom template with placeholders', () => {
      const files = ['src/app.ts', 'src/utils.ts'];
      const template = 'auto: {count} files updated on {date}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '2 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toContain('auto: 2 files updated on');
      expect(message).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should replace type placeholder in custom template', () => {
      const files = ['src/app.ts'];
      const template = 'Update {type} files: {count}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '1 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toBe('Update code files: 1');
    });

    it('should replace summary placeholder in custom template', () => {
      const files = ['src/app.ts', 'src/utils.ts'];
      const template = 'Changes: {summary}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '2 code files updated'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toBe('Changes: 2 code files updated');
    });

    it('should truncate long commit messages to 72 characters', () => {
      const files = Array.from({ length: 100 }, (_, i) => `file${i}.ts`);
      const longTemplate = 'This is a very long commit message template that exceeds the maximum length and should be truncated appropriately to fit within limits';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '100 code'
      });

      const message = gitManager.generateCommitMessage(files, longTemplate);

      expect(message.length).toBeLessThanOrEqual(72);
      expect(message).toContain('...');
    });

    it('should handle date placeholders in custom template', () => {
      const files = ['src/app.ts'];
      const template = 'Daily commit {day}, {month} {year}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '1 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      const now = new Date();
      const expectedDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      const expectedMonth = now.toLocaleDateString('en-US', { month: 'long' });
      const expectedYear = now.getFullYear().toString();

      expect(message).toContain(expectedDay);
      expect(message).toContain(expectedMonth);
      expect(message).toContain(expectedYear);
    });

    it('should handle time placeholders in custom template', () => {
      const files = ['src/app.ts'];
      const template = 'Commit at {time}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '1 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toMatch(/Commit at \d{2}:\d{2}:\d{2}/);
    });

    it('should handle timestamp placeholder in custom template', () => {
      const files = ['src/app.ts'];
      const template = 'Timestamp: {timestamp}';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '1 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toMatch(/Timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle files alias for count placeholder', () => {
      const files = ['src/app.ts', 'src/utils.ts', 'src/types.ts'];
      const template = 'Updated {files} files';
      
      (analyzeFiles as jest.Mock).mockReturnValue({
        changeType: 'code',
        files,
        summary: '3 code'
      });

      const message = gitManager.generateCommitMessage(files, template);

      expect(message).toBe('Updated 3 files');
    });
  });

  describe('repository path management', () => {
    it('should return the repository path', () => {
      const path = gitManager.getRepositoryPath();
      expect(path).toBe('/test/repo');
    });

    it('should allow setting a new repository path', () => {
      gitManager.setRepositoryPath('/new/repo/path');
      expect(gitManager.getRepositoryPath()).toBe('/new/repo/path');
    });
  });
});
