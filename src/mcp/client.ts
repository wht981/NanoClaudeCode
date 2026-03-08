/**
 * MCP Client implementation
 * Wraps @modelcontextprotocol/sdk Client with our interface
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  MCPClient,
  MCPConnectionOptions,
  MCPServerInfo,
  MCPResource,
  MCPResourceContent,
  MCPTool,
  MCPToolResult,
  MCPPrompt,
  MCPPromptResult,
  MCPClientInfo,
} from '../types/mcp.js';
import { createTransport, type TransportOptions } from './transports.js';

/**
 * MCP Client options
 */
export interface MCPClientOptions {
  /** Client name */
  name: string;
  /** Client version */
  version: string;
  /** Transport configuration */
  transport: TransportOptions;
  /** Connection timeout in ms */
  timeout?: number;
}

/**
 * MCP Client implementation using SDK
 */
export class MCPClientImpl implements MCPClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private serverInfo: MCPServerInfo | null = null;
  private connected = false;
  private readonly options: MCPClientOptions;

  constructor(options: MCPClientOptions) {
    this.options = options;
  }

  /**
   * Connect to MCP server
   */
  async connect(options?: MCPConnectionOptions): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    try {
      // Use provided options or default to constructor options
      const transportOptions: TransportOptions = options
        ? {
            type: 'stdio',
            command: options.command,
            args: options.args,
            env: options.env,
          }
        : this.options.transport;

      // Create transport
      this.transport = await createTransport(transportOptions);

      // Create client
      this.client = new Client(
        {
          name: this.options.name,
          version: this.options.version,
        },
        {
          capabilities: {
            roots: {
              listChanged: true,
            },
          },
        }
      );

      // Connect to server
      await this.client.connect(this.transport);

      // Get server info
      const info = await this.client.getServerVersion();
      this.serverInfo = {
        name: info?.name || 'Unknown',
        version: info?.version || '0.0.0',
        protocolVersion: (info?.protocolVersion as string) || '2024-11-05',
        capabilities: (info?.capabilities as MCPServerInfo['capabilities']) || {},
      };

      this.connected = true;
    } catch (error) {
      // Clean up on error
      await this.cleanup();
      throw new Error(`Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.cleanup();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * List available resources
   */
  async listResources(): Promise<MCPResource[]> {
    const client = this.getClient();

    try {
      const result = await client.listResources();
      return (result.resources || []).map((resource: any) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
    } catch (error) {
      throw new Error(`Failed to list resources: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read resource content
   */
  async readResource(uri: string): Promise<MCPResourceContent> {
    const client = this.getClient();

    try {
      const result = await client.readResource({ uri });
      
      if (!result.contents || result.contents.length === 0) {
        throw new Error(`No content found for resource: ${uri}`);
      }

      const content = result.contents[0] as Record<string, unknown>;
      return {
        uri,
        mimeType: typeof content.mimeType === 'string' ? content.mimeType : undefined,
        text: typeof content.text === 'string' ? content.text : undefined,
        blob: typeof content.blob === 'string' ? content.blob : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    const client = this.getClient();

    try {
      const result = await client.listTools();
      return (result.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = this.getClient();

    try {
      const result = await client.callTool({
        name,
        arguments: args,
      });

      const resultContent = Array.isArray(result.content) ? result.content : [];

      return {
        content: resultContent.map((item: any) => ({
          type: item.type as 'text' | 'image' | 'resource',
          text: typeof item.text === 'string' ? item.text : undefined,
          data: typeof item.data === 'string' ? item.data : undefined,
          mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
        })),
        isError: Boolean(result.isError),
      };
    } catch (error) {
      throw new Error(`Failed to call tool '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    const client = this.getClient();

    try {
      const result = await client.listPrompts();
      return (result.prompts || []).map((prompt: any) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments?.map((arg: any) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        })),
      }));
    } catch (error) {
      throw new Error(`Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get prompt
   */
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<MCPPromptResult> {
    const client = this.getClient();

    try {
      const stringArgs = args
        ? Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)]))
        : undefined;
      const result = await client.getPrompt({
        name,
        arguments: stringArgs,
      });

      return {
        description: typeof result.description === 'string' ? result.description : undefined,
        messages: (result.messages || []).map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: {
            type: msg.content.type as 'text' | 'image' | 'resource',
            text: typeof msg.content.text === 'string' ? msg.content.text : undefined,
            data: typeof msg.content.data === 'string' ? msg.content.data : undefined,
            mimeType: typeof msg.content.mimeType === 'string' ? msg.content.mimeType : undefined,
          },
        })),
      };
    } catch (error) {
      throw new Error(`Failed to get prompt '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Send notification to server
   */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const client = this.getClient();

    try {
      await client.notification({
        method,
        params,
      });
    } catch (error) {
      throw new Error(`Failed to send notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('MCP client not connected');
    }
  }

  private getClient(): Client {
    this.ensureConnected();
    return this.client!;
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }

      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
    } catch (error) {
      // Ignore cleanup errors
      console.error('Error during cleanup:', error);
    } finally {
      this.connected = false;
      this.serverInfo = null;
    }
  }
}

/**
 * Create MCP client
 */
export function createMCPClient(options: MCPClientOptions): MCPClient {
  return new MCPClientImpl(options);
}

/**
 * Create and connect MCP client
 */
export async function connectMCPClient(options: MCPClientOptions): Promise<MCPClient> {
  const client = createMCPClient(options);
  await client.connect();
  return client;
}
