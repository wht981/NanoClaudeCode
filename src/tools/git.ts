/**
 * Git integration tool for common git operations
 */
import { BaseTool } from './base';
import type { ToolResult, JSONSchema } from '../types/tool';

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  changes: string;
}

interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
}

export class GitTool extends BaseTool {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'commit', 'branch', 'checkout'],
          description: 'Git operation to perform',
        },
        message: {
          type: 'string',
          description: 'Commit message (required for commit operation)',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to add before commit or files to diff',
        },
        branchName: {
          type: 'string',
          description: 'Branch name (for checkout or branch operations)',
        },
        createBranch: {
          type: 'boolean',
          description: 'Create new branch when checking out',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Limit number of log entries',
        },
      },
      required: ['operation'],
      additionalProperties: false,
    };

    super('git', 'Execute git operations like status, diff, log, commit, branch, and checkout', schema);
    this.workingDirectory = workingDirectory;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(`Invalid arguments: ${validation.errors?.join(', ')}`);
    }

    const { operation, message, files, branchName, createBranch, limit } = args as {
      operation: string;
      message?: string;
      files?: string[];
      branchName?: string;
      createBranch?: boolean;
      limit?: number;
    };

    try {
      switch (operation) {
        case 'status':
          return await this.gitStatus();
        case 'diff':
          return await this.gitDiff(files);
        case 'log':
          return await this.gitLog(limit || 10);
        case 'commit':
          return await this.gitCommit(message, files);
        case 'branch':
          return await this.gitBranch(branchName);
        case 'checkout':
          return await this.gitCheckout(branchName, createBranch);
        default:
          return this.error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return this.error(`Git operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private execGit(args: string[], cwd?: string): string {
    const result = Bun.spawnSync(['git', ...args], {
      cwd: cwd || this.workingDirectory,
      timeout: 30_000,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const decoder = new TextDecoder();
    const stdout = decoder.decode(result.stdout).trim();
    const stderr = decoder.decode(result.stderr).trim();

    if (!result.success) {
      throw new Error(stderr || stdout || `Git command failed with exit code ${result.exitCode}`);
    }

    return stdout;
  }

  private async gitStatus(): Promise<ToolResult> {
    try {
      // Get current branch
      const branch = this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);

      // Get ahead/behind counts
      let ahead = 0;
      let behind = 0;
      try {
        const tracking = this.execGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
        const [aheadStr, behindStr] = tracking.split('\t');
        ahead = parseInt(aheadStr || '0', 10) || 0;
        behind = parseInt(behindStr || '0', 10) || 0;
      } catch {
        // No upstream branch
      }

      // Get file status
      const statusOutput = this.execGit(['status', '--porcelain']);
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of statusOutput.split('\n')) {
        if (!line) continue;

        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status[0] !== ' ' && status[0] !== '?') {
          staged.push(file);
        }
        if (status[1] !== ' ' && status[1] !== '?') {
          unstaged.push(file);
        }
        if (status[0] === '?' && status[1] === '?') {
          untracked.push(file);
        }
      }

      const status: GitStatus = {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
      };

      return this.success('Git status retrieved', { status });
    } catch (error) {
      throw new Error(`Failed to get git status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gitDiff(files?: string[]): Promise<ToolResult> {
    try {
      const args = ['diff', '--numstat'];
      if (files && files.length > 0) {
        args.push('--', ...files);
      }

      const diffOutput = this.execGit(args);
      const diffs: GitDiff[] = [];

      for (const line of diffOutput.split('\n')) {
        if (!line) continue;

        const parts = line.split('\t');
        if (parts.length >= 3) {
          const additions = parseInt(parts[0] || '0', 10) || 0;
          const deletions = parseInt(parts[1] || '0', 10) || 0;
          const file = parts[2] || '';

          // Get actual diff for this file
          const changes = file ? this.execGit(['diff', '--', file]) : '';

          diffs.push({
            file,
            additions,
            deletions,
            changes,
          });
        }
      }

      return this.success('Git diff retrieved', { diffs });
    } catch (error) {
      throw new Error(`Failed to get git diff: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gitLog(limit: number): Promise<ToolResult> {
    try {
      const format = '%H%n%an%n%aI%n%s%n---';
      const logOutput = this.execGit(['log', `--max-count=${limit}`, `--format=${format}`]);
      const entries: GitLogEntry[] = [];

      const commits = logOutput.split('---\n').filter(Boolean);
      for (const commit of commits) {
        const lines = commit.trim().split('\n');
        if (lines.length >= 4) {
          entries.push({
            hash: lines[0] || '',
            author: lines[1] || '',
            date: lines[2] || '',
            message: lines[3] || '',
          });
        }
      }

      return this.success('Git log retrieved', { entries });
    } catch (error) {
      throw new Error(`Failed to get git log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gitCommit(message?: string, files?: string[]): Promise<ToolResult> {
    if (!message) {
      return this.error('Commit message is required');
    }

    try {
      // Add files if specified
      if (files && files.length > 0) {
        this.execGit(['add', ...files]);
      }

      // Commit
      const commitOutput = this.execGit(['commit', '-m', message]);
      
      // Get the commit hash
      const hash = this.execGit(['rev-parse', 'HEAD']);

      return this.success('Changes committed successfully', {
        hash,
        message,
        output: commitOutput,
      });
    } catch (error) {
      throw new Error(`Failed to commit: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gitBranch(branchName?: string): Promise<ToolResult> {
    try {
      if (branchName) {
        // Create new branch
        this.execGit(['branch', branchName]);
        return this.success(`Branch '${branchName}' created`, { branchName });
      }

      // List branches
      const branchOutput = this.execGit(['branch', '-vv']);
      const branches: GitBranch[] = [];

      for (const line of branchOutput.split('\n')) {
        if (!line) continue;

        const current = line.startsWith('*');
        const name = current ? (line.substring(2).split(/\s+/)[0] || '') : (line.trim().split(/\s+/)[0] || '');
        
        // Extract remote tracking branch
        const remoteMatch = line.match(/\[([^\]]+)\]/);
        const remote = remoteMatch ? (remoteMatch[1]?.split(':')[0] || undefined) : undefined;

        branches.push({
          name,
          current,
          remote,
        });
      }

      return this.success('Git branches retrieved', { branches });
    } catch (error) {
      throw new Error(`Failed to manage branches: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gitCheckout(branchName?: string, createBranch?: boolean): Promise<ToolResult> {
    if (!branchName) {
      return this.error('Branch name is required for checkout');
    }

    try {
      const args = ['checkout'];
      if (createBranch) {
        args.push('-b');
      }
      args.push(branchName);

      const output = this.execGit(args);
      return this.success(`Checked out branch '${branchName}'`, {
        branchName,
        created: createBranch,
        output,
      });
    } catch (error) {
      throw new Error(`Failed to checkout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
