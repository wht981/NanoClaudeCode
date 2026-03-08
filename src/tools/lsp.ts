/**
 * LSP (Language Server Protocol) code intelligence tool
 * Provides IDE-like features: go-to-definition, find-references, hover-info
 */
import { BaseTool } from './base';
import type { ToolResult, JSONSchema } from '../types/tool';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

interface LSPOperation {
  operation: 'go_to_definition' | 'find_references' | 'hover_info' | 'shutdown';
  filePath?: string;
  line?: number;
  character?: number;
  language?: 'typescript' | 'python' | 'javascript';
}

interface LSPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface Position {
  line: number;
  character: number;
}

interface Location {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

export class LSPTool extends BaseTool {
  private servers: Map<string, ChildProcess> = new Map();
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private messageBuffers: Map<string, string> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['go_to_definition', 'find_references', 'hover_info', 'shutdown'],
          description: 'The LSP operation to perform',
        },
        filePath: {
          type: 'string',
          description: 'The file path for the operation',
        },
        line: {
          type: 'integer',
          description: 'Line number (0-based)',
          minimum: 0,
        },
        character: {
          type: 'integer',
          description: 'Character position in the line (0-based)',
          minimum: 0,
        },
        language: {
          type: 'string',
          enum: ['typescript', 'python', 'javascript'],
          description: 'Programming language for the LSP server',
          default: 'typescript',
        },
      },
      required: ['operation'],
      additionalProperties: false,
    };

    super(
      'lsp',
      'Language Server Protocol tool for code intelligence: go-to-definition, find-references, hover-info',
      schema
    );

    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(`Invalid arguments: ${validation.errors?.join(', ')}`);
    }

    const operation = args.operation as 'go_to_definition' | 'find_references' | 'hover_info' | 'shutdown';
    const filePath = args.filePath as string | undefined;
    const line = args.line as number | undefined;
    const character = args.character as number | undefined;
    const language = (args.language as string | undefined) || 'typescript';

    try {
      if (operation === 'shutdown') {
        return await this.shutdownServers();
      }

      if (!filePath || line === undefined || character === undefined) {
        return this.error('filePath, line, and character are required for LSP operations');
      }

      const server = await this.getOrStartServer(language);
      if (!server) {
        return this.error(`Failed to start LSP server for ${language}`);
      }

      switch (operation) {
        case 'go_to_definition':
          return await this.goToDefinition(language, filePath, line, character);
        case 'find_references':
          return await this.findReferences(language, filePath, line, character);
        case 'hover_info':
          return await this.hoverInfo(language, filePath, line, character);
        default:
          return this.error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        return this.error(`LSP operation failed: ${error.message}`);
      }
      return this.error('Unknown error occurred');
    }
  }

  /**
   * Get or start an LSP server for the specified language
   */
  private async getOrStartServer(language: string): Promise<ChildProcess | null> {
    if (this.servers.has(language)) {
      return this.servers.get(language)!;
    }

    const serverConfig = this.getServerConfig(language);
    if (!serverConfig) {
      return null;
    }

    const server = spawn(serverConfig.command, serverConfig.args, {
      cwd: this.workspaceRoot,
    });

    this.servers.set(language, server);
    this.messageBuffers.set(language, '');

    // Set up message handling
    server.stdout?.on('data', (data: Buffer) => {
      this.handleServerMessage(language, data);
    });

    server.stderr?.on('data', (data: Buffer) => {
      console.error(`LSP server error (${language}):`, data.toString());
    });

    server.on('error', (error: Error) => {
      console.error(`LSP server spawn error (${language}):`, error);
      this.servers.delete(language);
    });

    server.on('exit', (code: number | null) => {
      console.log(`LSP server exited (${language}) with code ${code}`);
      this.servers.delete(language);
      this.messageBuffers.delete(language);
    });

    // Initialize the server
    await this.initializeServer(language, server);

    return server;
  }

  /**
   * Get server configuration for a language
   */
  private getServerConfig(language: string): { command: string; args: string[] } | null {
    switch (language) {
      case 'typescript':
      case 'javascript':
        // TypeScript Language Server
        return {
          command: 'npx',
          args: ['typescript-language-server', '--stdio'],
        };
      case 'python':
        // Pyright or Pylsp
        return {
          command: 'pyright-langserver',
          args: ['--stdio'],
        };
      default:
        return null;
    }
  }

  /**
   * Initialize LSP server with capabilities
   */
  private async initializeServer(language: string, server: ChildProcess): Promise<void> {
    const initializeParams = {
      processId: process.pid,
      rootUri: `file://${this.workspaceRoot}`,
      capabilities: {
        textDocument: {
          definition: {
            linkSupport: true,
          },
          references: {},
          hover: {
            contentFormat: ['plaintext', 'markdown'],
          },
        },
      },
    };

    const response = await this.sendRequest(language, 'initialize', initializeParams);
    
    if (!response || (response as any).error) {
      throw new Error(`Failed to initialize LSP server: ${JSON.stringify((response as any)?.error)}`);
    }

    // Send initialized notification
    await this.sendNotification(language, 'initialized', {});
  }

  /**
   * Handle incoming messages from LSP server
   */
  private handleServerMessage(language: string, data: Buffer): void {
    const buffer = this.messageBuffers.get(language) || '';
    const newBuffer = buffer + data.toString();
    this.messageBuffers.set(language, newBuffer);

    // Parse complete messages (Content-Length: ...\r\n\r\n{json})
    let bufferContent = newBuffer;
    
    while (true) {
      const headerEnd = bufferContent.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = bufferContent.substring(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/);
      
      if (!contentLengthMatch || !contentLengthMatch[1]) break;

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (bufferContent.length < messageEnd) break;

      const messageJson = bufferContent.substring(messageStart, messageEnd);
      bufferContent = bufferContent.substring(messageEnd);

      try {
        const message: LSPMessage = JSON.parse(messageJson);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse LSP message:', error);
      }
    }

    this.messageBuffers.set(language, bufferContent);
  }

  /**
   * Handle parsed LSP message
   */
  private handleMessage(message: LSPMessage): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }

  /**
   * Send JSON-RPC request to LSP server
   */
  private async sendRequest(
    language: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(language);
    if (!server || !server.stdin) {
      throw new Error(`LSP server not available for ${language}`);
    }

    const id = this.requestId++;
    const request: LSPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const message = JSON.stringify(request);
    const header = `Content-Length: ${Buffer.byteLength(message, 'utf-8')}\r\n\r\n`;
    const fullMessage = header + message;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 5 seconds
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('LSP request timeout'));
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      server.stdin!.write(fullMessage, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Send JSON-RPC notification to LSP server (no response expected)
   */
  private async sendNotification(
    language: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const server = this.servers.get(language);
    if (!server || !server.stdin) {
      throw new Error(`LSP server not available for ${language}`);
    }

    const notification: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification);
    const header = `Content-Length: ${Buffer.byteLength(message, 'utf-8')}\r\n\r\n`;
    const fullMessage = header + message;

    server.stdin.write(fullMessage);
  }

  /**
   * Go to definition operation
   */
  private async goToDefinition(
    language: string,
    filePath: string,
    line: number,
    character: number
  ): Promise<ToolResult> {
    const uri = `file://${path.resolve(this.workspaceRoot, filePath)}`;

    const params = {
      textDocument: { uri },
      position: { line, character },
    };

    const result = await this.sendRequest(language, 'textDocument/definition', params);

    if (!result) {
      return this.success('No definition found', { locations: [] });
    }

    const locations = Array.isArray(result) ? result : [result];
    const formattedLocations = locations.map((loc: Location) => ({
      file: loc.uri.replace('file://', ''),
      line: loc.range.start.line,
      character: loc.range.start.character,
    }));

    return this.success(`Found ${formattedLocations.length} definition(s)`, {
      locations: formattedLocations,
    });
  }

  /**
   * Find references operation
   */
  private async findReferences(
    language: string,
    filePath: string,
    line: number,
    character: number
  ): Promise<ToolResult> {
    const uri = `file://${path.resolve(this.workspaceRoot, filePath)}`;

    const params = {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    };

    const result = await this.sendRequest(language, 'textDocument/references', params);

    if (!result || !Array.isArray(result)) {
      return this.success('No references found', { references: [] });
    }

    const formattedReferences = result.map((ref: Location) => ({
      file: ref.uri.replace('file://', ''),
      line: ref.range.start.line,
      character: ref.range.start.character,
    }));

    return this.success(`Found ${formattedReferences.length} reference(s)`, {
      references: formattedReferences,
    });
  }

  /**
   * Hover info operation
   */
  private async hoverInfo(
    language: string,
    filePath: string,
    line: number,
    character: number
  ): Promise<ToolResult> {
    const uri = `file://${path.resolve(this.workspaceRoot, filePath)}`;

    const params = {
      textDocument: { uri },
      position: { line, character },
    };

    const result = await this.sendRequest(language, 'textDocument/hover', params);

    if (!result || !(result as any).contents) {
      return this.success('No hover information available', { hover: null });
    }

    const hover = result as { contents: string | { language: string; value: string } | Array<string | { language: string; value: string }> };
    let hoverText = '';

    if (typeof hover.contents === 'string') {
      hoverText = hover.contents;
    } else if (Array.isArray(hover.contents)) {
      hoverText = hover.contents.map((item) => 
        typeof item === 'string' ? item : item.value
      ).join('\n');
    } else if (typeof hover.contents === 'object') {
      hoverText = hover.contents.value;
    }

    return this.success('Hover information retrieved', {
      hover: hoverText,
    });
  }

  /**
   * Shutdown all LSP servers
   */
  private async shutdownServers(): Promise<ToolResult> {
    const shutdownPromises: Promise<void>[] = [];

    for (const [language, server] of this.servers.entries()) {
      const promise = (async () => {
        try {
          await this.sendRequest(language, 'shutdown', {});
          await this.sendNotification(language, 'exit', {});
        } catch (error) {
          console.error(`Error shutting down ${language} server:`, error);
        }
        server.kill();
      })();
      shutdownPromises.push(promise);
    }

    await Promise.all(shutdownPromises);
    this.servers.clear();
    this.messageBuffers.clear();
    this.pendingRequests.clear();

    return this.success('All LSP servers shut down successfully', {
      serversShutdown: shutdownPromises.length,
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.shutdownServers();
  }
}
