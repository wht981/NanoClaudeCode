/**
 * Search tool test script
 */
import { describe, expect, it, beforeEach } from 'bun:test';
import { SearchTool } from '../src/tools/search';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SearchTool', () => {
  let tmpDir: string;
  let searchTool: SearchTool;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-test-'));
    searchTool = new SearchTool(tmpDir);

    // Create test files
    await fs.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'test1.txt'), 'Hello World\nThis is a test\n');
    await fs.writeFile(path.join(tmpDir, 'test2.txt'), 'Another test file\nWith multiple lines\n');
    await fs.writeFile(path.join(tmpDir, 'test.js'), 'console.log("test");\nfunction hello() {}\n');
    await fs.writeFile(path.join(tmpDir, 'subdir', 'nested.txt'), 'Nested file content\n');
  });

  describe('glob operation', () => {
    it('should find files matching pattern', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
        pattern: '*.txt',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBeGreaterThanOrEqual(2);
      expect(result.metadata?.files).toContain('test1.txt');
      expect(result.metadata?.files).toContain('test2.txt');
    });

    it('should find files with wildcard pattern', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
        pattern: '**/*.txt',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBeGreaterThanOrEqual(3);
    });

    it('should respect maxResults limit', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
        pattern: '*.txt',
        maxResults: 1,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(1);
      expect(result.metadata?.truncated).toBe(true);
    });

    it('should validate required parameters', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });
  });

  describe('grep operation', () => {
    it('should find content in files', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(2);
      const matches = result.metadata?.matches as any[];
      expect(matches.some((m: any) => m.file.includes('test1.txt'))).toBe(true);
    });

    it('should perform case-insensitive search', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: 'HELLO',
        caseInsensitive: true,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(1);
    });

    it('should support regex patterns', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: 'test\\d',
        useRegex: true,
      });

      expect(result.success).toBe(true);
    });

    it('should find matches with line numbers', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: 'Hello',
      });

      expect(result.success).toBe(true);
      const matches = result.metadata?.matches as any[];
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0]).toHaveProperty('line');
      expect(matches[0]).toHaveProperty('column');
      expect(matches[0]).toHaveProperty('file');
      expect(matches[0]).toHaveProperty('content');
    });

    it('should respect maxResults limit', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: 'test',
        maxResults: 1,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(1);
      expect(result.metadata?.truncated).toBe(true);
    });

    it('should handle invalid regex gracefully', async () => {
      const result = await searchTool.execute({
        operation: 'grep',
        pattern: '[invalid(',
        useRegex: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });
  });

  describe('path validation', () => {
    it('should prevent directory traversal', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
        pattern: '*.txt',
        path: '../../../etc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal');
    });

    it('should allow searching in subdirectories', async () => {
      const result = await searchTool.execute({
        operation: 'glob',
        pattern: '*.txt',
        path: 'subdir',
      });

      expect(result.success).toBe(true);
    });
  });
});
