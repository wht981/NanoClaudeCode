import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GitTool } from '../../src/tools/git';

const encoder = new TextEncoder();

function spawnResult(stdout = '', stderr = '', success = true, exitCode = 0) {
  return {
    stdout: encoder.encode(stdout),
    stderr: encoder.encode(stderr),
    success,
    exitCode,
  };
}

const mockSpawnSync = mock(() => spawnResult(''));
const originalSpawnSync = Bun.spawnSync;

describe('GitTool', () => {
  let tool: GitTool;

  beforeEach(() => {
    tool = new GitTool();
    Bun.spawnSync = mockSpawnSync as typeof Bun.spawnSync;
    mockSpawnSync.mockClear();
  });

  afterAll(() => {
    Bun.spawnSync = originalSpawnSync;
  });

  describe('status operation', () => {
    it('parses git status correctly', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult('main'))
        .mockReturnValueOnce(spawnResult('2\t3'))
        .mockReturnValueOnce(spawnResult('M  file1.ts\n M file2.ts\n?? file3.ts'));

      const result = await tool.execute({ operation: 'status' });

      expect(result.success).toBe(true);
      const status = result.metadata!.status as any;
      expect(status.branch).toBe('main');
      expect(status.ahead).toBe(2);
      expect(status.behind).toBe(3);
      expect(status.staged).toContain('file1.ts');
      expect(status.unstaged).toContain('file2.ts');
      expect(status.untracked).toContain('file3.ts');
    });

    it('handles missing upstream branch', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult('main'))
        .mockReturnValueOnce(spawnResult('', 'no upstream', false, 1))
        .mockReturnValueOnce(spawnResult('M  file1.ts'));

      const result = await tool.execute({ operation: 'status' });

      expect(result.success).toBe(true);
      const status = result.metadata!.status as any;
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });
  });

  describe('diff operation', () => {
    it('parses diff output', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult('10\t5\tfile1.ts\n3\t2\tfile2.ts'))
        .mockReturnValueOnce(spawnResult('diff --git a/file1.ts...'))
        .mockReturnValueOnce(spawnResult('diff --git a/file2.ts...'));

      const result = await tool.execute({ operation: 'diff' });

      expect(result.success).toBe(true);
      const diffs = result.metadata!.diffs as any[];
      expect(diffs).toHaveLength(2);
      expect(diffs[0].file).toBe('file1.ts');
      expect(diffs[0].additions).toBe(10);
      expect(diffs[0].deletions).toBe(5);
    });

    it('passes files as argument array', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult('10\t5\tfile1.ts'))
        .mockReturnValueOnce(spawnResult('diff --git a/file1.ts...'));

      const result = await tool.execute({ operation: 'diff', files: ['file1.ts'] });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'diff', '--numstat', '--', 'file1.ts']);
    });
  });

  describe('log operation', () => {
    it('parses git log output', async () => {
      const logOutput = `abc123
John Doe
2024-01-15T10:30:00Z
Initial commit
---
def456
Jane Smith
2024-01-16T11:00:00Z
Add feature
---
`;

      mockSpawnSync.mockReturnValueOnce(spawnResult(logOutput));

      const result = await tool.execute({ operation: 'log', limit: 10 });

      expect(result.success).toBe(true);
      const entries = result.metadata!.entries as any[];
      expect(entries).toHaveLength(2);
      expect(entries[0].hash).toBe('abc123');
      expect(entries[1].author).toBe('Jane Smith');
    });

    it('uses provided limit in args', async () => {
      mockSpawnSync.mockReturnValueOnce(spawnResult(''));
      await tool.execute({ operation: 'log', limit: 5 });
      expect(mockSpawnSync.mock.calls[0]?.[0]).toContain('--max-count=5');
    });
  });

  describe('commit operation', () => {
    it('commits with message', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult('[main abc123] Test commit'))
        .mockReturnValueOnce(spawnResult('abc123def456'));

      const result = await tool.execute({ operation: 'commit', message: 'Test commit' });

      expect(result.success).toBe(true);
      expect(result.metadata?.hash).toBe('abc123def456');
      expect(result.metadata?.message).toBe('Test commit');
    });

    it('adds files before commit', async () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult(''))
        .mockReturnValueOnce(spawnResult('[main abc123] Test'))
        .mockReturnValueOnce(spawnResult('abc123'));

      const result = await tool.execute({
        operation: 'commit',
        message: 'Test',
        files: ['file1.ts', 'file2.ts'],
      });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'add', 'file1.ts', 'file2.ts']);
    });

    it('requires commit message', async () => {
      const result = await tool.execute({ operation: 'commit' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Commit message is required');
    });
  });

  describe('branch and checkout operations', () => {
    it('lists branches', async () => {
      const branchOutput = `* main     abc123 Latest commit [origin/main]
  feature  def456 Feature work
  hotfix   789abc Bug fix [origin/hotfix]`;

      mockSpawnSync.mockReturnValueOnce(spawnResult(branchOutput));

      const result = await tool.execute({ operation: 'branch' });

      expect(result.success).toBe(true);
      const branches = result.metadata!.branches as any[];
      expect(branches).toHaveLength(3);
      expect(branches[0].name).toBe('main');
      expect(branches[0].current).toBe(true);
      expect(branches[0].remote).toBe('origin/main');
    });

    it('creates branch', async () => {
      mockSpawnSync.mockReturnValueOnce(spawnResult(''));

      const result = await tool.execute({ operation: 'branch', branchName: 'new-feature' });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'branch', 'new-feature']);
    });

    it('checks out with createBranch flag', async () => {
      mockSpawnSync.mockReturnValueOnce(spawnResult("Switched to a new branch 'new-feature'"));

      const result = await tool.execute({
        operation: 'checkout',
        branchName: 'new-feature',
        createBranch: true,
      });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'checkout', '-b', 'new-feature']);
    });
  });

  describe('validation and error handling', () => {
    it('validates operation', async () => {
      const result = await tool.execute({ operation: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('handles git command error output', async () => {
      mockSpawnSync.mockReturnValue(spawnResult('', 'fatal: not a git repository', false, 128));

      const result = await tool.execute({ operation: 'status' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('fatal: not a git repository');
    });
  });

  describe('injection prevention', () => {
    it('blocks semicolon filename injection', async () => {
      const payload = 'safe.txt;rm -rf /';
      mockSpawnSync.mockReturnValueOnce(spawnResult(''));

      const result = await tool.execute({ operation: 'diff', files: [payload] });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'diff', '--numstat', '--', payload]);
    });

    it('blocks command substitution injection', async () => {
      const payload = 'safe-$(whoami).txt';
      mockSpawnSync.mockReturnValueOnce(spawnResult(''));

      const result = await tool.execute({ operation: 'diff', files: [payload] });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'diff', '--numstat', '--', payload]);
    });

    it('blocks newline injection', async () => {
      const payload = 'safe\nrm -rf /.txt';
      mockSpawnSync.mockReturnValueOnce(spawnResult(''));

      const result = await tool.execute({ operation: 'diff', files: [payload] });

      expect(result.success).toBe(true);
      expect(mockSpawnSync.mock.calls[0]?.[0]).toEqual(['git', 'diff', '--numstat', '--', payload]);
    });
  });
});
