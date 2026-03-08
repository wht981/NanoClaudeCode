import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentContext } from '../types/agent';
import type {
  LLMCompletionOptions,
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMProvider,
} from '../types/llm';
import type { Tool, ToolResult } from '../types/tool';
import {
  CoderAgent,
  type CodeGenerationResult,
  type ProgrammingLanguage,
} from './coder';

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly supportedModels: LLMModel[] = [];

  private mockResponse = 'Generated code';

  setMockResponse(response: string): void {
    this.mockResponse = response;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    return {
      content: this.mockResponse,
      model: options.model,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
    };
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncIterable<LLMStreamChunk> {
    const chunks = this.mockResponse.split(' ');
    for (const chunk of chunks) {
      yield {
        content: chunk + ' ',
        model: options.model,
        finishReason: chunks[chunks.length - 1] === chunk ? 'stop' : undefined,
      };
    }
  }

  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }
}

class MockTool implements Tool {
  name = 'mock-tool';
  description = 'Mock tool for testing';
  parameters = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<ToolResult> {
    return {
      success: true,
      output: 'mock output',
    };
  }

  validateArgs(): { valid: boolean; errors?: string[] } {
    return { valid: true };
  }
}

function createContext(): AgentContext {
  return {
    sessionId: 'test-session',
    workingDirectory: '/tmp/test',
    environmentVariables: {},
    metadata: {},
  };
}

describe('CoderAgent', () => {
  let agent: CoderAgent;
  let provider: MockLLMProvider;
  let tool: MockTool;

  beforeEach(() => {
    agent = CoderAgent.create();
    provider = new MockLLMProvider();
    tool = new MockTool();
  });

  test('creates agent with default configuration', () => {
    expect(agent.config.role).toBe('coder');
    expect(agent.config.name).toBe('CoderAgent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.capabilities.canAccessFiles).toBe(true);
  });

  test('creates agent with custom configuration', () => {
    const customAgent = CoderAgent.create({
      name: 'CustomCoder',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(customAgent.config.name).toBe('CustomCoder');
    expect(customAgent.config.model).toBe('gpt-3.5-turbo');
    expect(customAgent.config.temperature).toBe(0.5);
  });

  test('supports multiple programming languages', () => {
    const languages: ProgrammingLanguage[] = [
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'rust',
    ];

    for (const language of languages) {
      expect(agent.isLanguageSupported(language)).toBe(true);
    }

    expect(agent.getSupportedLanguages().length).toBeGreaterThan(0);
  });

  test('throws error when executing before initialization', async () => {
    await expect(
      agent.execute('generate a function')
    ).rejects.toThrow('is not initialized');
  });

  test('generates code successfully', async () => {
    provider.setMockResponse(
      '```typescript\nfunction hello() {\n  console.log("Hello");\n}\n```'
    );

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate a hello function', {
      language: 'typescript',
      taskType: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.code).toContain('function hello()');
    expect(result.language).toBe('typescript');
    expect(result.taskType).toBe('generate');
    expect(result.metadata?.language).toBe('typescript');
  });

  test('returns error for unsupported language', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = (await agent.execute('generate code', {
      language: 'cobol' as ProgrammingLanguage,
      taskType: 'generate',
    })) as CodeGenerationResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');
  });

  test('extracts code from markdown code blocks', async () => {
    provider.setMockResponse(
      'Here is the code:\n```python\ndef hello():\n    print("Hello")\n```\nThis is a simple function.'
    );

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate a python function', {
      language: 'python',
      taskType: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe('def hello():\n    print("Hello")');
    expect(result.language).toBe('python');
  });

  test('handles multiple code blocks', async () => {
    provider.setMockResponse(
      '```typescript\nconst x = 1;\n```\n\n```typescript\nconst y = 2;\n```'
    );

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate code', {
      language: 'typescript',
    });

    expect(result.success).toBe(true);
    expect(result.code).toContain('const x = 1;');
    expect(result.code).toContain('const y = 2;');
  });

  test('returns warning when no code blocks found', async () => {
    provider.setMockResponse('This is just text without code blocks');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate code', {
      language: 'typescript',
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics?.length).toBeGreaterThan(0);
    expect(result.diagnostics?.[0]?.severity).toBe('warning');
  });

  test('streams code generation', async () => {
    provider.setMockResponse('function test() { return true; }');

    await agent.initialize(provider, [tool], createContext());

    const chunks: string[] = [];
    for await (const event of agent.executeStream('generate a test function', {
      language: 'typescript',
    })) {
      chunks.push(event.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('function test()');
  });

  test('uses generateCode convenience method', async () => {
    provider.setMockResponse(
      '```typescript\nfunction add(a: number, b: number) { return a + b; }\n```'
    );

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.generateCode(
      'create an add function',
      'typescript'
    );

    expect(result.success).toBe(true);
    expect(result.taskType).toBe('generate');
    expect(result.code).toContain('function add');
  });

  test('uses refactorCode convenience method', async () => {
    provider.setMockResponse('```typescript\n// Refactored code\n```');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.refactorCode(
      'function test() { var x = 1; }',
      'typescript'
    );

    expect(result.success).toBe(true);
    expect(result.taskType).toBe('refactor');
  });

  test('uses fixCode convenience method', async () => {
    provider.setMockResponse('```typescript\n// Fixed code\n```');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.fixCode(
      'function test() { return x; }',
      'typescript',
      'x is not defined'
    );

    expect(result.success).toBe(true);
    expect(result.taskType).toBe('fix');
  });

  test('uses generateTests convenience method', async () => {
    provider.setMockResponse('```typescript\n// Test code\n```');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.generateTests(
      'function add(a, b) { return a + b; }',
      'typescript',
      'vitest'
    );

    expect(result.success).toBe(true);
    expect(result.taskType).toBe('test');
  });

  test('uses reviewCode convenience method', async () => {
    provider.setMockResponse('The code looks good but could be improved...');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.reviewCode(
      'function test() { return true; }',
      'typescript'
    );

    expect(result.success).toBe(true);
    expect(result.taskType).toBe('review');
  });

  test('respects custom options in prompt building', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate code', {
      language: 'typescript',
      followBestPractices: true,
      includeComments: true,
      strictTypeChecking: true,
    });

    expect(result.success).toBe(true);
  });

  test('handles execution errors gracefully', async () => {
    provider.setMockResponse('error response');
    await agent.initialize(provider, [tool], createContext());

    // Simulate error by making provider throw
    const originalComplete = provider.complete.bind(provider);
    provider.complete = async () => {
      throw new Error('LLM error');
    };

    const result = await agent.execute('generate code', {
      language: 'typescript',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM error');
    expect(agent.getState()).toBe('error');

    // Restore
    provider.complete = originalComplete;
  });

  test('includes metadata in results', async () => {
    provider.setMockResponse('```typescript\nconst x = 1;\nconst y = 2;\n```');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate code', {
      language: 'typescript',
    });

    expect(result.metadata?.language).toBe('typescript');
    expect(result.metadata?.taskType).toBe('generate');
    expect(result.metadata?.codeLength).toBeGreaterThan(0);
    expect(result.metadata?.linesOfCode).toBeGreaterThan(0);
  });

  test('resets agent state properly', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.execute('generate code', { language: 'typescript' });
    expect(agent.getState()).toBe('idle');

    await agent.reset();
    expect(agent.getState()).toBe('idle');
  });

  test('disposes agent resources', async () => {
    await agent.initialize(provider, [tool], createContext());
    await agent.dispose();

    expect(agent.getState()).toBe('idle');

    // Should throw after disposal
    await expect(
      agent.execute('generate code')
    ).rejects.toThrow('is not initialized');
  });
});
