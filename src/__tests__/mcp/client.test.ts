/**
 * MCP Client tests
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createMCPClient, connectMCPClient } from '../../mcp/client';
import type { MCPClientOptions } from '../../mcp/client';
import type { MCPClient } from '../../types/mcp';

// Mock transport for testing
class MockTransport {
  private closed = false;

  async start() {
    // No-op
  }

  async close() {
    this.closed = true;
  }

  async send(message: any) {
    // Echo back mock responses
    if (message.method === 'initialize') {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
      };
    }
    return {};
  }

  isClosed() {
    return this.closed;
  }
}

describe('MCP Client', () => {
  let client: MCPClient;
  const baseOptions: MCPClientOptions = {
    name: 'test-client',
    version: '1.0.0',
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['test-server.js'],
    },
  };

  beforeEach(() => {
    // Reset any mocks
  });

  afterEach(async () => {
    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('createMCPClient', () => {
    test('should create client instance', () => {
      client = createMCPClient(baseOptions);
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });

    test('should have all required methods', () => {
      client = createMCPClient(baseOptions);
      expect(typeof client.connect).toBe('function');
      expect(typeof client.disconnect).toBe('function');
      expect(typeof client.isConnected).toBe('function');
      expect(typeof client.listResources).toBe('function');
      expect(typeof client.readResource).toBe('function');
      expect(typeof client.listTools).toBe('function');
      expect(typeof client.callTool).toBe('function');
      expect(typeof client.listPrompts).toBe('function');
      expect(typeof client.getPrompt).toBe('function');
      expect(typeof client.getServerInfo).toBe('function');
      expect(typeof client.notify).toBe('function');
    });
  });

  describe('Connection lifecycle', () => {
    test('should start disconnected', () => {
      client = createMCPClient(baseOptions);
      expect(client.isConnected()).toBe(false);
      expect(client.getServerInfo()).toBeNull();
    });

    test('should throw when calling methods before connecting', async () => {
      client = createMCPClient(baseOptions);
      
      await expect(client.listTools()).rejects.toThrow('not connected');
      await expect(client.listResources()).rejects.toThrow('not connected');
      await expect(client.listPrompts()).rejects.toThrow('not connected');
    });

    test('should allow disconnect when not connected', async () => {
      client = createMCPClient(baseOptions);
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Transport configuration', () => {
    test('should accept STDIO transport options', () => {
      const stdioClient = createMCPClient({
        name: 'test',
        version: '1.0.0',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { TEST: 'value' },
        },
      });
      expect(stdioClient).toBeDefined();
    });

    test('should accept HTTP transport options', () => {
      const httpClient = createMCPClient({
        name: 'test',
        version: '1.0.0',
        transport: {
          type: 'http',
          url: 'http://localhost:3000/mcp',
          headers: { Authorization: 'Bearer token' },
          timeout: 5000,
        },
      });
      expect(httpClient).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('should handle connection errors gracefully', async () => {
      client = createMCPClient({
        name: 'test',
        version: '1.0.0',
        transport: {
          type: 'stdio',
          command: 'nonexistent-command',
        },
      });

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    });

  });

  describe('Method signatures', () => {
    beforeEach(() => {
      client = createMCPClient(baseOptions);
    });

    test('callTool should accept name and args', async () => {
      const toolPromise = client.callTool('test-tool', { param: 'value' });
      await expect(toolPromise).rejects.toThrow('not connected');
    });

    test('readResource should accept uri', async () => {
      const resourcePromise = client.readResource('file://test.txt');
      await expect(resourcePromise).rejects.toThrow('not connected');
    });

    test('getPrompt should accept name and optional args', async () => {
      const promptPromise1 = client.getPrompt('test-prompt');
      await expect(promptPromise1).rejects.toThrow('not connected');

      const promptPromise2 = client.getPrompt('test-prompt', { arg: 'value' });
      await expect(promptPromise2).rejects.toThrow('not connected');
    });

    test('notify should accept method and optional params', async () => {
      const notifyPromise1 = client.notify('test-notification');
      await expect(notifyPromise1).rejects.toThrow('not connected');

      const notifyPromise2 = client.notify('test-notification', { data: 'value' });
      await expect(notifyPromise2).rejects.toThrow('not connected');
    });
  });

  describe('connectMCPClient helper', () => {
    test('should expose helper function', () => {
      expect(typeof connectMCPClient).toBe('function');
    });
  });
});

describe('MCP Client Integration', () => {
  test('should have correct interface shape', () => {
    const client = createMCPClient({
      name: 'test',
      version: '1.0.0',
      transport: {
        type: 'stdio',
        command: 'test',
      },
    });

    // Verify the client implements MCPClient interface
    const requiredMethods = [
      'connect',
      'disconnect',
      'isConnected',
      'listResources',
      'readResource',
      'listTools',
      'callTool',
      'listPrompts',
      'getPrompt',
      'getServerInfo',
      'notify',
    ];

    for (const method of requiredMethods) {
      expect(client).toHaveProperty(method);
      expect(typeof (client as any)[method]).toBe('function');
    }
  });

  test('should return correct types from getServerInfo', () => {
    const client = createMCPClient({
      name: 'test',
      version: '1.0.0',
      transport: {
        type: 'stdio',
        command: 'test',
      },
    });

    const info = client.getServerInfo();
    expect(info).toBeNull(); // Before connection
  });
});
