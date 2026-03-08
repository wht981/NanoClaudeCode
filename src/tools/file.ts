/**
 * File operations tool
 * Provides read, write, list, and delete operations with security validation
 */
import { BaseTool } from './base';
import type { ToolResult, JSONSchema } from '../types/tool';
import { promises as fs } from 'fs';
import * as path from 'path';

interface FileOperation {
  operation: 'read_file' | 'write_file' | 'list_directory' | 'delete_file';
  path: string;
  content?: string;
}

export class FileTool extends BaseTool {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read_file', 'write_file', 'list_directory', 'delete_file'],
          description: 'The file operation to perform',
        },
        path: {
          type: 'string',
          description: 'The file or directory path (relative to working directory)',
        },
        content: {
          type: 'string',
          description: 'Content to write (required for write_file operation)',
        },
      },
      required: ['operation', 'path'],
      additionalProperties: false,
    };

    super(
      'file',
      'Perform file operations: read, write, list directory, and delete files',
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

    const { operation, path: filePath, content } = args as unknown as FileOperation;

    // Validate and resolve path
    const resolvedPath = await this.validatePath(filePath);
    if (!resolvedPath) {
      return this.error('Invalid path: directory traversal not allowed');
    }

    try {
      switch (operation) {
        case 'read_file':
          return await this.readFile(resolvedPath);
        case 'write_file':
          if (content === undefined) {
            return this.error('Content is required for write_file operation');
          }
          return await this.writeFile(resolvedPath, content);
        case 'list_directory':
          return await this.listDirectory(resolvedPath);
        case 'delete_file':
          return await this.deleteFile(resolvedPath);
        default:
          return this.error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return this.error(`File not found: ${filePath}`);
        }
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          return this.error(`Permission denied: ${filePath}`);
        }
        return this.error(`File operation failed: ${error.message}`);
      }
      return this.error('Unknown error occurred');
    }
  }

  /**
   * Validate and resolve path to prevent directory traversal attacks
   */
  private async validatePath(filePath: string): Promise<string | null> {
    const resolvedPath = path.resolve(this.workingDirectory, filePath);
    const normalizedWorkingDirectory = path.normalize(this.workingDirectory);
    const normalizedPath = path.normalize(resolvedPath);
    const relativePath = path.relative(normalizedWorkingDirectory, normalizedPath);

    if (
      relativePath.startsWith('..') ||
      relativePath.startsWith('\\') ||
      path.isAbsolute(relativePath)
    ) {
      return null;
    }

    return normalizedPath;
  }

  /**
   * Read file contents
   */
  private async readFile(filePath: string): Promise<ToolResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    return this.success(content, {
      path: filePath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    });
  }

  /**
   * Write content to file
   */
  private async writeFile(filePath: string, content: string): Promise<ToolResult> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf-8');
    const stats = await fs.stat(filePath);

    return this.success('File written successfully', {
      path: filePath,
      size: stats.size,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
    });
  }

  /**
   * List directory contents
   */
  private async listDirectory(dirPath: string): Promise<ToolResult> {
    const stats = await fs.stat(dirPath);

    if (!stats.isDirectory()) {
      return this.error('Path is not a directory');
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const itemStats = await fs.stat(fullPath);

        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: itemStats.size,
          modified: itemStats.mtime.toISOString(),
        };
      })
    );

    return this.success(`Listed ${items.length} items`, {
      path: dirPath,
      items,
      count: items.length,
    });
  }

  /**
   * Delete file
   */
  private async deleteFile(filePath: string): Promise<ToolResult> {
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      return this.error('Cannot delete directory with delete_file (use separate tool)');
    }

    await fs.unlink(filePath);

    return this.success('File deleted successfully', {
      path: filePath,
    });
  }
}
