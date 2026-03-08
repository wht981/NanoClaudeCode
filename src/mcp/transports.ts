/**
 * MCP Transport implementations
 * Provides STDIO and HTTP/SSE transport factories
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export interface StdioTransportOptions {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpTransportOptions {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export type TransportOptions = StdioTransportOptions | HttpTransportOptions;

/**
 * Create transport based on configuration
 */
export async function createTransport(options: TransportOptions): Promise<Transport> {
  if (options.type === 'stdio') {
    return createStdioTransport(options);
  }
  
  if (options.type === 'http') {
    return createHttpTransport(options);
  }

  throw new Error('Unsupported transport type');
}

/**
 * Create STDIO transport for local MCP servers
 */
async function createStdioTransport(options: StdioTransportOptions): Promise<Transport> {
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args || [],
    env: options.env ? { ...baseEnv, ...options.env } : baseEnv,
  });

  return transport;
}

/**
 * Create HTTP/SSE transport for remote MCP servers
 */
async function createHttpTransport(options: HttpTransportOptions): Promise<Transport> {
  const transport = new SSEClientTransport(new URL(options.url));

  return transport;
}
