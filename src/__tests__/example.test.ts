/**
 * Example Test Suite
 * Demonstrates test structure and mock usage
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createMockTextResponse,
  createMockToolUseResponse,
  MockLLMClient,
} from './utils/mock-llm.ts';
import {
  sampleCodeSnippet,
  samplePrompt,
  sampleToolInput,
} from './fixtures/index.ts';

describe('Mock LLM Utilities', () => {
  let mockClient: MockLLMClient;

  beforeEach(() => {
    mockClient = new MockLLMClient();
  });

  it('should create a text response', () => {
    const response = createMockTextResponse('Hello, world!');
    expect(response.content[0]?.type).toBe('text');
    expect(response.content[0]?.text).toBe('Hello, world!');
  });

  it('should create a tool use response', () => {
    const response = createMockToolUseResponse('analyze_code', {
      code: sampleCodeSnippet,
    });
    expect(response.content[0]?.type).toBe('tool_use');
    expect((response.content[0] as { type: string; name?: string })?.name).toBe('analyze_code');
  });

  it('should track mock client calls', async () => {
    const response = createMockTextResponse('Test response');
    mockClient.registerResponse('test', response);

    await mockClient.createMessage('test');
    expect(mockClient.getCallCount('test')).toBe(1);

    await mockClient.createMessage('test');
    expect(mockClient.getCallCount('test')).toBe(2);
  });

  it('should use fixtures in tests', () => {
    expect(sampleCodeSnippet).toContain('fibonacci');
    expect(samplePrompt).toContain('memoization');
    expect(sampleToolInput.language).toBe('typescript');
  });

  it('should reset mock client state', async () => {
    const response = createMockTextResponse('Reset test');
    mockClient.registerResponse('reset', response);

    await mockClient.createMessage('reset');
    mockClient.reset();

    expect(mockClient.getCallCount('reset')).toBe(0);
  });

  it('should throw error for unregistered responses', async () => {
    try {
      await mockClient.createMessage('nonexistent');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('No mock response registered');
    }
  });
});
