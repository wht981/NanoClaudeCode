import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SearchTool } from '../search';

describe('SearchTool', () => {
  let tmpDir: string;
  let searchTool: SearchTool;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-tool-'));
    searchTool = new SearchTool(tmpDir);

    await fs.mkdir(path.join(tmpDir, 'dir-a'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'dir-b'), { recursive: true });

    await fs.writeFile(path.join(tmpDir, 'dir-a', 'shared.txt'), 'alpha-marker\n', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'dir-a', 'only-a.txt'), 'unique-a\n', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'dir-b', 'shared.txt'), 'beta-marker\n', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'dir-b', 'only-b.txt'), 'unique-b\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prevents directory traversal using normalized relative-path validation', async () => {
    const result = await searchTool.execute({
      operation: 'glob',
      pattern: '*.txt',
      path: '..\\..\\Windows\\System32',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('directory traversal not allowed');
  });

  it('handles concurrent searches without cwd race conditions', async () => {
    const concurrentRuns = 20;

    const tasks: Array<Promise<any>> = [];
    for (let i = 0; i < concurrentRuns; i++) {
      tasks.push(searchTool.execute({ operation: 'glob', pattern: '*.txt', path: 'dir-a' }));
      tasks.push(searchTool.execute({ operation: 'glob', pattern: '*.txt', path: 'dir-b' }));
      tasks.push(searchTool.execute({ operation: 'grep', pattern: 'alpha-marker', path: 'dir-a' }));
      tasks.push(searchTool.execute({ operation: 'grep', pattern: 'beta-marker', path: 'dir-b' }));
    }

    const results = await Promise.all(tasks);

    for (let i = 0; i < results.length; i += 4) {
      const globA = results[i];
      const globB = results[i + 1];
      const grepA = results[i + 2];
      const grepB = results[i + 3];

      expect(globA.success).toBe(true);
      expect(globA.metadata?.files).toEqual(expect.arrayContaining(['shared.txt', 'only-a.txt']));

      expect(globB.success).toBe(true);
      expect(globB.metadata?.files).toEqual(expect.arrayContaining(['shared.txt', 'only-b.txt']));

      expect(grepA.success).toBe(true);
      expect(grepA.metadata?.matchCount).toBeGreaterThanOrEqual(1);
      expect((grepA.metadata?.matches as Array<{ file: string }>)[0]?.file).toBe('shared.txt');

      expect(grepB.success).toBe(true);
      expect(grepB.metadata?.matchCount).toBeGreaterThanOrEqual(1);
      expect((grepB.metadata?.matches as Array<{ file: string }>)[0]?.file).toBe('shared.txt');
    }
  });
});
