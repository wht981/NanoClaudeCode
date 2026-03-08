/**
 * Model Context Protocol (MCP) types
 * Based on @modelcontextprotocol/sdk
 */

import type { JSONSchema } from './tool';

/**
 * MCP Protocol version
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * MCP Request/Response types
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Resource types
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

/**
 * MCP Tool types
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Prompt types
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

/**
 * MCP Server capabilities
 */
export interface MCPServerCapabilities {
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
}

/**
 * MCP Client capabilities
 */
export interface MCPClientCapabilities {
  sampling?: Record<string, unknown>;
  roots?: {
    listChanged?: boolean;
  };
}

/**
 * MCP Server information
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
}

/**
 * MCP Client information
 */
export interface MCPClientInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
}

/**
 * MCP Connection options
 */
export interface MCPConnectionOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * MCP Client interface
 */
export interface MCPClient {
  /**
   * Connect to MCP server
   */
  connect(options?: MCPConnectionOptions): Promise<void>;

  /**
   * Disconnect from MCP server
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * List available resources
   */
  listResources(): Promise<MCPResource[]>;

  /**
   * Read resource content
   */
  readResource(uri: string): Promise<MCPResourceContent>;

  /**
   * List available tools
   */
  listTools(): Promise<MCPTool[]>;

  /**
   * Call a tool
   */
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;

  /**
   * List available prompts
   */
  listPrompts(): Promise<MCPPrompt[]>;

  /**
   * Get prompt
   */
  getPrompt(name: string, args?: Record<string, unknown>): Promise<MCPPromptResult>;

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo | null;

  /**
   * Send notification
   */
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
}

/**
 * MCP Server manager for handling multiple servers
 */
export interface MCPServerManager {
  /**
   * Register MCP server
   */
  registerServer(name: string, options: MCPConnectionOptions): Promise<void>;

  /**
   * Unregister MCP server
   */
  unregisterServer(name: string): Promise<void>;

  /**
   * Get MCP client for server
   */
  getClient(name: string): MCPClient | undefined;

  /**
   * Get all registered servers
   */
  getAllServers(): string[];

  /**
   * Connect all servers
   */
  connectAll(): Promise<void>;

  /**
   * Disconnect all servers
   */
  disconnectAll(): Promise<void>;

  /**
   * Get aggregated tools from all servers
   */
  getAllTools(): Promise<MCPTool[]>;

  /**
   * Get aggregated resources from all servers
   */
  getAllResources(): Promise<MCPResource[]>;

  /**
   * Get aggregated prompts from all servers
   */
  getAllPrompts(): Promise<MCPPrompt[]>;
}
