/**
 * Integration Smoke Test
 * Tests basic ToolExecutor and FileTool integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { ToolExecutor } from '../../tools/executor';
import { ToolRegistry } from '../../tools/registry';
import { FileTool } from '../../tools/file';

describe('Integration Smoke Test', () => {
  let tempDir: string;
  let executor: ToolExecutor;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.promises.mkdtemp(path.join(process.cwd(), 'test-temp-'));

    // Create ToolExecutor with file tool
    const registry = new ToolRegistry();
    const fileTool = new FileTool(tempDir);
    registry.register(fileTool);
    executor = new ToolExecutor(registry);
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('should execute file tool through executor', async () => {
    // Write a test file
    const testContent = 'Hello, Integration Test!';
    const testFile = 'test.txt';

    const writeResult = await executor.execute('file', {
      operation: 'write_file',
      path: testFile,
      content: testContent,
    });

    expect(writeResult.success).toBe(true);
    expect(writeResult.toolName).toBe('file');

    // Read it back
    const readResult = await executor.execute('file', {
      operation: 'read_file',
      path: testFile,
    });

    expect(readResult.success).toBe(true);
    expect(readResult.success).toBe(true);
    expect(readResult.metadata?.size).toBeGreaterThan(0);
  });

  it('should handle file operations with validation', async () => {
    const testFile = 'validated.txt';
    const testContent = 'Validated content';

    // Execute with validation enabled
    const result = await executor.execute(
      'file',
      {
        operation: 'write_file',
        path: testFile,
        content: testContent,
      },
      { validate: true }
    );

    expect(result.success).toBe(true);
    expect(result.validated).toBe(true);
  });

  it('should track execution duration', async () => {
    const result = await executor.execute('file', {
      operation: 'write_file',
      path: 'duration-test.txt',
      content: 'Testing duration',
    });

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe('number');
  });

  it('should list directory contents', async () => {
    // Write a test file
    await executor.execute('file', {
      operation: 'write_file',
      path: 'file1.txt',
      content: 'File 1',
    });

    await executor.execute('file', {
      operation: 'write_file',
      path: 'file2.txt',
      content: 'File 2',
    });

    // List directory
    const listResult = await executor.execute('file', {
      operation: 'list_directory',
      path: '.',
    });

    expect(listResult.success).toBe(true);
    expect(listResult.metadata?.items).toBeDefined();
    const items = listResult.metadata?.items as Array<{name: string}>;
    expect(items.map((i) => i.name)).toContain('file1.txt');
    expect(items.map((i) => i.name)).toContain('file2.txt');
  });

  it('should validate missing required arguments', async () => {
    const result = await executor.execute('file', {
      operation: 'write_file',
      path: 'test.txt',
      // missing content
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Content is required');
  });

  it('should detect invalid tool name', async () => {
    const result = await executor.execute('nonexistent-tool', {
      operation: 'read_file',
      path: 'test.txt',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should handle nested directory creation', async () => {
    const nestedPath = 'subdir/nested/file.txt';
    const content = 'Nested content';

    const writeResult = await executor.execute('file', {
      operation: 'write_file',
      path: nestedPath,
      content: content,
    });

    expect(writeResult.success).toBe(true);

    // Verify file exists
    const readResult = await executor.execute('file', {
      operation: 'read_file',
      path: nestedPath,
    });

    expect(readResult.success).toBe(true);
    expect(readResult.success).toBe(true);
    expect(readResult.metadata?.size).toBeGreaterThan(0);
  });
});
