/**
 * Tests for FileTool
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FileTool } from './file';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

describe('FileTool', () => {
  let tool: FileTool;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(tmpdir(), `file-tool-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    tool = new FileTool(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('read_file', () => {
    test('reads existing file', async () => {
      const testFile = 'test.txt';
      const content = 'Hello, World!';
      await fs.writeFile(path.join(testDir, testFile), content);

      const result = await tool.execute({
        operation: 'read_file',
        path: testFile,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe(content);
      expect(result.metadata?.size).toBeGreaterThan(0);
    });

    test('returns error for non-existent file', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: 'nonexistent.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('prevents directory traversal', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '../../../etc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });
  });

  describe('write_file', () => {
    test('writes content to new file', async () => {
      const testFile = 'new.txt';
      const content = 'Test content';

      const result = await tool.execute({
        operation: 'write_file',
        path: testFile,
        content,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('File written successfully');

      // Verify file was created
      const written = await fs.readFile(path.join(testDir, testFile), 'utf-8');
      expect(written).toBe(content);
    });

    test('overwrites existing file', async () => {
      const testFile = 'overwrite.txt';
      await fs.writeFile(path.join(testDir, testFile), 'Old content');

      const newContent = 'New content';
      const result = await tool.execute({
        operation: 'write_file',
        path: testFile,
        content: newContent,
      });

      expect(result.success).toBe(true);

      const written = await fs.readFile(path.join(testDir, testFile), 'utf-8');
      expect(written).toBe(newContent);
    });

    test('creates nested directories', async () => {
      const testFile = 'sub/dir/nested.txt';
      const content = 'Nested file';

      const result = await tool.execute({
        operation: 'write_file',
        path: testFile,
        content,
      });

      expect(result.success).toBe(true);

      const written = await fs.readFile(path.join(testDir, testFile), 'utf-8');
      expect(written).toBe(content);
    });

    test('returns error when content is missing', async () => {
      const result = await tool.execute({
        operation: 'write_file',
        path: 'test.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content is required');
    });

    test('prevents directory traversal', async () => {
      const result = await tool.execute({
        operation: 'write_file',
        path: '../../../tmp/evil.txt',
        content: 'malicious',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });
  });

  describe('list_directory', () => {
    test('lists directory contents', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await tool.execute({
        operation: 'list_directory',
        path: '.',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(3);
      expect(result.metadata?.items).toBeArrayOfSize(3);

      const items = result.metadata?.items as any[];
      const names = items.map((item) => item.name).sort();
      expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);

      const file1 = items.find((item) => item.name === 'file1.txt');
      expect(file1?.type).toBe('file');
      expect(file1?.size).toBeGreaterThan(0);

      const subdir = items.find((item) => item.name === 'subdir');
      expect(subdir?.type).toBe('directory');
    });

    test('returns error for non-existent directory', async () => {
      const result = await tool.execute({
        operation: 'list_directory',
        path: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('returns error for file path', async () => {
      const testFile = 'file.txt';
      await fs.writeFile(path.join(testDir, testFile), 'content');

      const result = await tool.execute({
        operation: 'list_directory',
        path: testFile,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a directory');
    });
  });

  describe('delete_file', () => {
    test('deletes existing file', async () => {
      const testFile = 'delete-me.txt';
      await fs.writeFile(path.join(testDir, testFile), 'content');

      const result = await tool.execute({
        operation: 'delete_file',
        path: testFile,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('File deleted successfully');

      // Verify file was deleted
      const exists = await fs
        .access(path.join(testDir, testFile))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    test('returns error for non-existent file', async () => {
      const result = await tool.execute({
        operation: 'delete_file',
        path: 'nonexistent.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('returns error for directory', async () => {
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await tool.execute({
        operation: 'delete_file',
        path: 'subdir',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete directory');
    });
  });

  describe('validation', () => {
    test('validates required parameters', async () => {
      const result = await tool.execute({
        operation: 'read_file',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter: path');
    });

    test('validates operation enum', async () => {
      const result = await tool.execute({
        operation: 'invalid_operation',
        path: 'test.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    test('rejects additional properties', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: 'test.txt',
        unexpected: 'value',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown parameter');
    });
  });

  describe('security', () => {
    test('prevents access outside working directory with ../', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '../outside.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });

    test('prevents absolute path outside working directory', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '/etc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });

    test('blocks traversal payload with repeated dot segments', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '....//....//etc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });

    test('blocks traversal payload with url-encoded separators', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '%2e%2e%2fetc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('blocks traversal payload using windows backslashes', async () => {
      const result = await tool.execute({
        operation: 'read_file',
        path: '..\\..\\..\\Windows\\System32',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal not allowed');
    });

    test('allows nested paths within working directory', async () => {
      await fs.mkdir(path.join(testDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'sub', 'file.txt'), 'content');

      const result = await tool.execute({
        operation: 'read_file',
        path: 'sub/file.txt',
      });

      expect(result.success).toBe(true);
    });
  });
});
