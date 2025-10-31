/**
 * File analyzer utility for categorizing changed files
 * Used by GitManager for intelligent commit message generation
 */

import * as path from 'path';
import { FileChangeType, FileAnalysis } from '../types';

/**
 * Analyze a list of files and categorize them for commit message generation
 */
export function analyzeFiles(files: string[]): FileAnalysis {
  if (files.length === 0) {
    return {
      changeType: 'mixed',
      files: [],
      summary: 'no changes'
    };
  }

  const categories = {
    code: 0,
    config: 0,
    documentation: 0,
    test: 0,
    asset: 0,
    dependency: 0
  };

  // Categorize each file
  for (const file of files) {
    const category = categorizeFile(file);
    if (category !== 'mixed') {
      categories[category]++;
    }
  }

  // Determine the primary change type
  const totalCategorized = Object.values(categories).reduce((sum, count) => sum + count, 0);
  const maxCategory = Object.entries(categories).reduce((max, [category, count]) => 
    count > max.count ? { category: category as FileChangeType, count } : max,
    { category: 'mixed' as FileChangeType, count: 0 }
  );

  // If more than 70% of files are in one category, use that category
  const changeType = totalCategorized > 0 && (maxCategory.count / totalCategorized) > 0.7 
    ? maxCategory.category 
    : 'mixed';

  return {
    changeType,
    files,
    summary: generateChangeSummary(categories, files.length)
  };
}

/**
 * Categorize a single file based on its path and extension
 */
export function categorizeFile(filePath: string): FileChangeType {
  const fileName = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();
  const directory = path.dirname(filePath).toLowerCase();

  // Dependency files
  if (isDependencyFile(fileName, directory)) {
    return 'dependency';
  }

  // Configuration files
  if (isConfigFile(fileName, extension)) {
    return 'config';
  }

  // Documentation files
  if (isDocumentationFile(fileName, extension, directory)) {
    return 'documentation';
  }

  // Test files
  if (isTestFile(fileName, directory)) {
    return 'test';
  }

  // Asset files
  if (isAssetFile(extension, directory)) {
    return 'asset';
  }

  // Code files
  if (isCodeFile(extension)) {
    return 'code';
  }

  // Default to mixed for unknown file types
  return 'mixed';
}

/**
 * Check if file is a dependency file
 */
function isDependencyFile(fileName: string, directory: string): boolean {
  const dependencyFiles = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'composer.json',
    'composer.lock',
    'requirements.txt',
    'pipfile',
    'pipfile.lock',
    'gemfile',
    'gemfile.lock',
    'cargo.toml',
    'cargo.lock',
    'go.mod',
    'go.sum'
  ];

  return dependencyFiles.includes(fileName) || 
         directory.includes('node_modules') ||
         directory.includes('vendor');
}

/**
 * Check if file is a configuration file
 */
function isConfigFile(fileName: string, extension: string): boolean {
  const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.ini', '.conf'];
  const configPatterns = ['config', '.env', 'settings', 'options'];

  // Check for config-related filenames
  const hasConfigPattern = configPatterns.some(pattern => fileName.includes(pattern));
  
  // Check for dotfiles (but exclude .git files)
  const isDotfile = fileName.startsWith('.') && !fileName.includes('git');
  
  // Check for config extensions
  const hasConfigExtension = configExtensions.includes(extension);

  return hasConfigPattern || isDotfile || hasConfigExtension;
}

/**
 * Check if file is a documentation file
 */
function isDocumentationFile(fileName: string, extension: string, directory: string): boolean {
  const docExtensions = ['.md', '.txt', '.rst', '.adoc', '.org'];
  const docPatterns = ['readme', 'changelog', 'license', 'contributing', 'authors'];
  const docDirectories = ['docs', 'documentation', 'wiki'];

  const hasDocExtension = docExtensions.includes(extension);
  const hasDocPattern = docPatterns.some(pattern => fileName.includes(pattern));
  const inDocDirectory = docDirectories.some(dir => directory.includes(dir));

  return hasDocExtension || hasDocPattern || inDocDirectory;
}

/**
 * Check if file is a test file
 */
function isTestFile(fileName: string, directory: string): boolean {
  const testPatterns = ['test', 'spec', '.test.', '.spec.'];
  const testDirectories = ['test', '__tests__', 'spec', 'specs', 'tests'];

  const hasTestPattern = testPatterns.some(pattern => fileName.includes(pattern));
  const inTestDirectory = testDirectories.some(dir => directory.includes(dir));

  return hasTestPattern || inTestDirectory;
}

/**
 * Check if file is an asset file
 */
function isAssetFile(extension: string, directory: string): boolean {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp'];
  const styleExtensions = ['.css', '.scss', '.sass', '.less', '.styl'];
  const fontExtensions = ['.woff', '.woff2', '.ttf', '.eot', '.otf'];
  const mediaExtensions = ['.mp4', '.webm', '.mp3', '.wav', '.ogg', '.avi', '.mov'];
  const assetDirectories = ['assets', 'static', 'public', 'images', 'img', 'media', 'fonts'];

  const assetExtensions = [
    ...imageExtensions,
    ...styleExtensions,
    ...fontExtensions,
    ...mediaExtensions
  ];

  const hasAssetExtension = assetExtensions.includes(extension);
  const inAssetDirectory = assetDirectories.some(dir => directory.includes(dir));

  return hasAssetExtension || inAssetDirectory;
}

/**
 * Check if file is a code file
 */
function isCodeFile(extension: string): boolean {
  const codeExtensions = [
    // JavaScript/TypeScript
    '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    // Python
    '.py', '.pyx', '.pyi',
    // Java/Kotlin/Scala
    '.java', '.kt', '.scala',
    // C/C++
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
    // C#
    '.cs',
    // PHP
    '.php', '.phtml',
    // Ruby
    '.rb', '.rake',
    // Go
    '.go',
    // Rust
    '.rs',
    // Swift
    '.swift',
    // Dart
    '.dart',
    // Other languages
    '.sh', '.bash', '.zsh', '.fish',
    '.sql',
    '.html', '.htm',
    '.xml',
    '.vue', '.svelte'
  ];

  return codeExtensions.includes(extension);
}

/**
 * Generate a summary of changes for logging
 */
function generateChangeSummary(categories: Record<string, number>, totalFiles: number): string {
  const nonZeroCategories = Object.entries(categories)
    .filter(([_, count]) => count > 0)
    .map(([category, count]) => `${count} ${category}`)
    .join(', ');

  return nonZeroCategories || `${totalFiles} files`;
}

/**
 * Generate a detailed breakdown of file changes
 */
export function getFileChangeBreakdown(files: string[]): Record<FileChangeType, string[]> {
  const breakdown: Record<FileChangeType, string[]> = {
    code: [],
    config: [],
    documentation: [],
    test: [],
    asset: [],
    dependency: [],
    mixed: []
  };

  for (const file of files) {
    const category = categorizeFile(file);
    breakdown[category].push(file);
  }

  return breakdown;
}

/**
 * Get file statistics for a list of files
 */
export function getFileStats(files: string[]): {
  total: number;
  byType: Record<FileChangeType, number>;
  byExtension: Record<string, number>;
} {
  const byType: Record<FileChangeType, number> = {
    code: 0,
    config: 0,
    documentation: 0,
    test: 0,
    asset: 0,
    dependency: 0,
    mixed: 0
  };

  const byExtension: Record<string, number> = {};

  for (const file of files) {
    const category = categorizeFile(file);
    byType[category]++;

    const extension = path.extname(file).toLowerCase() || '(no extension)';
    byExtension[extension] = (byExtension[extension] || 0) + 1;
  }

  return {
    total: files.length,
    byType,
    byExtension
  };
}