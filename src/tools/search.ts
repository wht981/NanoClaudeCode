/**
 * Search tool
 * Provides glob (file pattern matching) and grep (content search) operations
 */
import { BaseTool } from './base';
import type { ToolResult, JSONSchema } from '../types/tool';
import { Glob } from 'bun';
import { promises as fs } from 'fs';
import * as path from 'path';

interface SearchOperation {
  operation: 'glob' | 'grep';
  pattern: string;
  path?: string;
  caseInsensitive?: boolean;
  useRegex?: boolean;
  maxResults?: number;
  includeBinary?: boolean;
  followSymlinks?: boolean;
}

interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
}

export class SearchTool extends BaseTool {
  private workingDirectory: string;
  private readonly DEFAULT_MAX_RESULTS = 1000;
  private readonly BINARY_CHECK_BYTES = 8192;

  constructor(workingDirectory: string = process.cwd()) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['glob', 'grep'],
          description: 'The search operation to perform',
        },
        pattern: {
          type: 'string',
          description: 'Pattern to search for (glob pattern or search string/regex)',
        },
        path: {
          type: 'string',
          description: 'The path to search in (relative to working directory, defaults to ".")',
        },
        caseInsensitive: {
          type: 'boolean',
          description: 'Whether to perform case-insensitive search (default: false)',
        },
        useRegex: {
          type: 'boolean',
          description: 'Whether to treat pattern as regex for grep (default: false)',
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 1000)',
          minimum: 1,
          maximum: 10000,
        },
        includeBinary: {
          type: 'boolean',
          description: 'Whether to include binary files in search (default: false)',
        },
        followSymlinks: {
          type: 'boolean',
          description: 'Whether to follow symlinks (default: false)',
        },
      },
      required: ['operation', 'pattern'],
      additionalProperties: false,
    };

    super(
      'search',
      'Search for files by pattern (glob) or search content in files (grep)',
      schema
    );

    this.workingDirectory = path.resolve(workingDirectory);
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // Validate arguments
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(`Invalid arguments: ${validation.errors?.join(', ')}`);
    }

    const {
      operation,
      pattern,
      path: searchPath = '.',
      caseInsensitive = false,
      useRegex = false,
      maxResults = this.DEFAULT_MAX_RESULTS,
      includeBinary = false,
      followSymlinks = false,
    } = args as unknown as SearchOperation;

    // Validate and resolve path
    const resolvedPath = this.validatePath(searchPath);
    if (!resolvedPath) {
      return this.error('Invalid path: directory traversal not allowed');
    }

    try {
      switch (operation) {
        case 'glob':
          return await this.globSearch(pattern, resolvedPath, maxResults, followSymlinks);
        case 'grep':
          return await this.grepSearch(
            pattern,
            resolvedPath,
            caseInsensitive,
            useRegex,
            maxResults,
            includeBinary,
            followSymlinks
          );
        default:
          return this.error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        return this.error(`Search failed: ${error.message}`);
      }
      return this.error('Unknown error occurred');
    }
  }

  /**
   * Validate and resolve path to prevent directory traversal attacks
   */
  private validatePath(searchPath: string): string | null {
    const resolvedPath = path.normalize(path.resolve(this.workingDirectory, searchPath));
    const normalizedWorkingDirectory = path.normalize(this.workingDirectory);
    const relativePath = path.relative(normalizedWorkingDirectory, resolvedPath);

    // Check if the resolved path is within the working directory
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null;
    }

    return resolvedPath;
  }

  /**
   * Perform glob search to find files matching pattern
   */
  private async globSearch(
    pattern: string,
    searchPath: string,
    maxResults: number,
    followSymlinks: boolean
  ): Promise<ToolResult> {
    const glob = new Glob(pattern);
    const results: string[] = [];
    let count = 0;

    for await (const file of glob.scan({ cwd: searchPath, followSymlinks, onlyFiles: true })) {
      if (count >= maxResults) {
        break;
      }
      results.push(file);
      count++;
    }

    const truncated = count >= maxResults;
    const message = truncated
      ? `Found ${count} files (truncated at max limit)`
      : `Found ${count} files`;

    return this.success(message, {
      pattern,
      path: searchPath,
      files: results,
      count,
      truncated,
    });
  }

  /**
   * Perform grep search to find content in files
   */
  private async grepSearch(
    pattern: string,
    searchPath: string,
    caseInsensitive: boolean,
    useRegex: boolean,
    maxResults: number,
    includeBinary: boolean,
    followSymlinks: boolean
  ): Promise<ToolResult> {
    const matches: GrepMatch[] = [];
    let filesScanned = 0;
    let matchCount = 0;

    // Build search regex
    let searchRegex: RegExp;
    try {
      if (useRegex) {
        searchRegex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
      } else {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, caseInsensitive ? 'gi' : 'g');
      }
    } catch (error) {
      return this.error(`Invalid regex pattern: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // Scan all files
    const glob = new Glob('**/*');
    for await (const file of glob.scan({ cwd: searchPath, followSymlinks, onlyFiles: true })) {
      if (matchCount >= maxResults) {
        break;
      }

      const fullPath = path.join(searchPath, file);

      // Check if file is binary (unless includeBinary is true)
      if (!includeBinary && await this.isBinaryFile(fullPath)) {
        continue;
      }

      filesScanned++;
      const fileMatches = await this.searchFileContent(fullPath, file, searchRegex, maxResults - matchCount);
      matches.push(...fileMatches);
      matchCount += fileMatches.length;
    }

    const truncated = matchCount >= maxResults;
    const message = truncated
      ? `Found ${matchCount} matches in ${filesScanned} files (truncated at max limit)`
      : `Found ${matchCount} matches in ${filesScanned} files`;

    return this.success(message, {
      pattern,
      path: searchPath,
      matches,
      filesScanned,
      matchCount,
      truncated,
    });
  }

  /**
   * Check if a file is binary
   */
  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const file = Bun.file(filePath);
      const buffer = await file.slice(0, this.BINARY_CHECK_BYTES).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Check for null bytes (common in binary files)
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) {
          return true;
        }
      }

      return false;
    } catch {
      // If we can't read the file, assume it's not binary
      return false;
    }
  }

  /**
   * Search content in a single file
   */
  private async searchFileContent(
    fullPath: string,
    relativePath: string,
    regex: RegExp,
    maxMatches: number
  ): Promise<GrepMatch[]> {
    const matches: GrepMatch[] = [];

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      for (let lineNum = 0; lineNum < lines.length && matches.length < maxMatches; lineNum++) {
        const line = lines[lineNum] || '';
        // Reset regex lastIndex for global flag
        regex.lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null && matches.length < maxMatches) {
          matches.push({
            file: relativePath,
            line: lineNum + 1,
            column: match.index + 1,
            content: line.trim(),
          });

          // Prevent infinite loop on zero-width matches
          if (regex.lastIndex === match.index) {
            regex.lastIndex++;
          }
        }
      }
    } catch (error) {
      // Skip files that can't be read as UTF-8
    }

    return matches;
  }
}
