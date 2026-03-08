/**
 * Tests for LSPTool
 * 
 * Note: These tests focus on validation and structure.
 * Full LSP server integration tests would require actual LSP servers installed.
 */
import { describe, test, expect } from 'bun:test';
import { LSPTool } from './lsp';

describe('LSPTool', () => {
  let tool: LSPTool;

  describe('initialization', () => {
    test('creates tool with default workspace', () => {
      tool = new LSPTool();
      
      expect(tool.name).toBe('lsp');
      expect(tool.description).toContain('Language Server Protocol');
      expect(tool.parameters.type).toBe('object');
    });

    test('creates tool with custom workspace', () => {
      tool = new LSPTool('/custom/workspace');
      
      expect(tool.name).toBe('lsp');
    });
  });

  describe('schema validation', () => {
    test('has correct parameter schema', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.operation).toBeDefined();
      expect(tool.parameters.properties.operation.enum).toEqual([
        'go_to_definition',
        'find_references',
        'hover_info',
        'shutdown',
      ]);

      expect(tool.parameters.properties.filePath).toBeDefined();
      expect(tool.parameters.properties.filePath.type).toBe('string');

      expect(tool.parameters.properties.line).toBeDefined();
      expect(tool.parameters.properties.line.type).toBe('integer');
      expect(tool.parameters.properties.line.minimum).toBe(0);

      expect(tool.parameters.properties.character).toBeDefined();
      expect(tool.parameters.properties.character.type).toBe('integer');
      expect(tool.parameters.properties.character.minimum).toBe(0);

      expect(tool.parameters.properties.language).toBeDefined();
      expect(tool.parameters.properties.language.enum).toEqual([
        'typescript',
        'python',
        'javascript',
      ]);
    });

    test('marks operation as required', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.required).toContain('operation');
    });
  });

  describe('argument validation', () => {
    test('validates required operation parameter', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('operation');
    });

    test('validates operation enum values', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'invalid_operation',
        filePath: 'test.ts',
        line: 0,
        character: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    test('validates line number minimum', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 'test.ts',
        line: -1,
        character: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be at least 0');
    });

    test('validates character position minimum', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 'test.ts',
        line: 0,
        character: -1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be at least 0');
    });

    test('validates language enum values', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 'test.ts',
        line: 0,
        character: 0,
        language: 'rust', // not supported
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    test('requires filePath for non-shutdown operations', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        line: 0,
        character: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filePath, line, and character are required');
    });

    test('requires line for non-shutdown operations', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 'test.ts',
        character: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filePath, line, and character are required');
    });

    test('requires character for non-shutdown operations', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 'test.ts',
        line: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filePath, line, and character are required');
    });

    test('allows shutdown without filePath/line/character', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'shutdown',
      });

      // Should succeed (no servers to shut down)
      expect(result.success).toBe(true);
      expect(result.output).toContain('shut down successfully');
    });
  });

  describe('operations', () => {
    test('supports go_to_definition operation', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.operation.enum).toContain('go_to_definition');
    });

    test('supports find_references operation', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.operation.enum).toContain('find_references');
    });

    test('supports hover_info operation', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.operation.enum).toContain('hover_info');
    });

    test('supports shutdown operation', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.operation.enum).toContain('shutdown');
    });
  });

  describe('language support', () => {
    test('supports typescript', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.language.enum).toContain('typescript');
    });

    test('supports javascript', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.language.enum).toContain('javascript');
    });

    test('supports python', () => {
      tool = new LSPTool();
      
      expect(tool.parameters.properties.language.enum).toContain('python');
    });

    test('defaults to typescript', async () => {
      tool = new LSPTool();
      
      // The default should be applied when language is not provided
      expect(tool.parameters.properties.language.default).toBe('typescript');
    });
  });

  describe('cleanup', () => {
    test('cleanup method exists and is callable', async () => {
      tool = new LSPTool();
      
      await expect(tool.cleanup()).resolves.toBeUndefined();
    });

    test('shutdown operation cleans up servers', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({ operation: 'shutdown' });
      
      expect(result.success).toBe(true);
      expect(result.metadata?.serversShutdown).toBe(0);
    });
  });

  describe('error handling', () => {
    test('handles invalid parameter types', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'go_to_definition',
        filePath: 123, // should be string
        line: 0,
        character: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('should be string');
    });

    test('rejects additional properties', async () => {
      tool = new LSPTool();
      
      const result = await tool.execute({
        operation: 'shutdown',
        unexpectedParam: 'value',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown parameter');
    });
  });

  describe('JSON-RPC protocol support', () => {
    test('tool is designed for JSON-RPC communication', () => {
      tool = new LSPTool();
      
      // The tool should have the necessary structure to support LSP
      expect(tool).toHaveProperty('execute');
      expect(tool.name).toBe('lsp');
      expect(tool.description).toContain('Language Server Protocol');
    });
  });
});
