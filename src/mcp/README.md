# MCP Client Implementation

Complete MCP (Model Context Protocol) client implementation with STDIO and HTTP/SSE transport support.

## Features

- ✅ **Full MCP SDK Integration** - Wraps `@modelcontextprotocol/sdk` for type-safe operations
- ✅ **Multiple Transports** - STDIO (local) and HTTP/SSE (remote) support
- ✅ **Tools Discovery & Execution** - List and call MCP tools
- ✅ **Resources Fetching** - Read resources from MCP servers
- ✅ **Prompts Retrieval** - Get prompts with arguments
- ✅ **Connection Lifecycle** - Proper connect/disconnect handling
- ✅ **Error Handling** - Comprehensive error messages
- ✅ **Unit Tested** - Full test coverage with mock servers

## Usage

### Basic Example

```typescript
import { createMCPClient, connectMCPClient } from './mcp';

// Create client
const client = createMCPClient({
  name: 'my-app',
  version: '1.0.0',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
  },
});

// Connect
await client.connect();

// List and call tools
const tools = await client.listTools();
const result = await client.callTool('read_file', { path: '/etc/hosts' });

// Disconnect
await client.disconnect();
```

### STDIO Transport (Local Servers)

```typescript
const client = createMCPClient({
  name: 'my-app',
  version: '1.0.0',
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['./my-mcp-server.js'],
    env: {
      API_KEY: 'secret',
    },
  },
});
```

### HTTP/SSE Transport (Remote Servers)

```typescript
const client = createMCPClient({
  name: 'my-app',
  version: '1.0.0',
  transport: {
    type: 'http',
    url: 'http://localhost:3000/mcp',
    headers: {
      Authorization: 'Bearer token',
    },
    timeout: 5000,
  },
});
```

### Helper: Connect on Creation

```typescript
// Create and connect in one call
const client = await connectMCPClient({
  name: 'my-app',
  version: '1.0.0',
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['server.js'],
  },
});
```

## API Reference

### MCPClient

#### `connect(options?: MCPConnectionOptions): Promise<void>`
Connect to MCP server. Options override constructor transport.

#### `disconnect(): Promise<void>`
Disconnect from MCP server.

#### `isConnected(): boolean`
Check connection status.

#### `listResources(): Promise<MCPResource[]>`
List available resources.

#### `readResource(uri: string): Promise<MCPResourceContent>`
Read resource content by URI.

#### `listTools(): Promise<MCPTool[]>`
List available tools.

#### `callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>`
Execute a tool with arguments.

#### `listPrompts(): Promise<MCPPrompt[]>`
List available prompts.

#### `getPrompt(name: string, args?: Record<string, unknown>): Promise<MCPPromptResult>`
Get prompt with optional arguments.

#### `getServerInfo(): MCPServerInfo | null`
Get server information (null before connection).

#### `notify(method: string, params?: Record<string, unknown>): Promise<void>`
Send notification to server.

## Types

### TransportOptions

```typescript
type TransportOptions = StdioTransportOptions | HttpTransportOptions;

interface StdioTransportOptions {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface HttpTransportOptions {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}
```

### MCPResource

```typescript
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
```

### MCPTool

```typescript
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}
```

### MCPPrompt

```typescript
interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
```

## Testing

```bash
# Run MCP client tests
bun test src/__tests__/mcp/client.test.ts

# Run all tests
bun test

# Type checking
bun run typecheck
```

## Architecture

```
src/mcp/
├── client.ts       # MCPClientImpl - main implementation
├── transports.ts   # Transport factory (STDIO/HTTP)
├── index.ts        # Public exports
└── __tests__/
    └── client.test.ts  # Comprehensive unit tests
```

## Error Handling

All methods throw descriptive errors:

```typescript
try {
  await client.listTools();
} catch (error) {
  // "MCP client not connected"
  // "Failed to list tools: <reason>"
}
```

## Connection Lifecycle

1. **Create** - Instantiate client with config
2. **Connect** - Establish transport and handshake
3. **Use** - Call tools, read resources, get prompts
4. **Disconnect** - Clean up resources

```typescript
const client = createMCPClient(options);  // 1. Create
await client.connect();                    // 2. Connect
const tools = await client.listTools();    // 3. Use
await client.disconnect();                 // 4. Disconnect
```

## Implementation Details

- Uses `@modelcontextprotocol/sdk` Client class
- Supports MCP protocol version `2024-11-05`
- Handles SDK type mismatches with `any` casting where needed
- Ensures single connection per client instance
- Automatically cleans up on errors
- Filters undefined env vars for STDIO transport

## License

MIT
