import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentConfig, AgentContext, AgentResult } from '../types/agent';
import type {
  LLMCompletionOptions,
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMProvider,
} from '../types/llm';
import type { Tool, ToolResult } from '../types/tool';
import { BaseAgent } from './base';

class MockProvider implements LLMProvider {
  readonly name = 'mock-provider';
  readonly supportedModels: LLMModel[] = [];

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    return {
      content: options.messages[0]?.content ?? '',
      model: options.model,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
    };
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncIterable<LLMStreamChunk> {
    yield {
      content: options.messages[0]?.content ?? '',
      model: options.model,
      finishReason: 'stop',
    };
  }

  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }
}

class MockTool implements Tool {
  name = 'mock-tool';
  description = 'Mock tool';
  parameters = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<ToolResult> {
    return {
      success: true,
      output: 'ok',
    };
  }

  validateArgs(): { valid: boolean; errors?: string[] } {
    return { valid: true };
  }
}

class TestAgent extends BaseAgent {
  public initializeCalls = 0;
  public disposeCalls = 0;
  public resetCalls = 0;

  async execute(input: string): Promise<AgentResult> {
    this.ensureInitialized();
    this.setState('executing');

    const output = `${this.config.name}:${input}`;

    this.setState('idle');
    return this.createSuccessResult('Execution completed', output);
  }

  protected override async onInitialize(): Promise<void> {
    this.initializeCalls += 1;
  }

  protected override async onDispose(): Promise<void> {
    this.disposeCalls += 1;
  }

  protected override async onReset(): Promise<void> {
    this.resetCalls += 1;
  }
}

function createAgentConfig(): AgentConfig {
  return {
    role: 'assistant',
    name: 'test-agent',
    description: 'Agent for tests',
    systemPrompt: 'You are a tester',
    capabilities: {
      canExecuteTools: true,
      canStreamResponses: true,
      canAccessFiles: false,
      canAccessNetwork: false,
      canModifySystem: false,
      maxContextTokens: 4096,
    },
    llmProvider: 'mock-provider',
    model: 'mock-model',
  };
}

function createContext(): AgentContext {
  return {
    sessionId: 'session-1',
    workingDirectory: '/tmp',
    environmentVariables: {},
    metadata: {},
  };
}

describe('BaseAgent', () => {
  let provider: MockProvider;
  let tool: MockTool;
  let agent: TestAgent;

  beforeEach(() => {
    provider = new MockProvider();
    tool = new MockTool();
    agent = new TestAgent(createAgentConfig(), 'agent-1');
  });

  test('initializes and exposes base properties', async () => {
    await agent.initialize(provider, [tool], createContext());

    expect(agent.id).toBe('agent-1');
    expect(agent.config.name).toBe('test-agent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.getState()).toBe('idle');
    expect(agent.initializeCalls).toBe(1);
  });

  test('throws on execute before initialize', async () => {
    await expect(agent.execute('run')).rejects.toThrow("Agent 'agent-1' is not initialized");
  });

  test('supports execute and executeStream lifecycle', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('hello');
    expect(result.success).toBe(true);
    expect(result.output).toBe('test-agent:hello');

    const chunks: string[] = [];
    for await (const event of agent.executeStream('stream')) {
      chunks.push(`${event.type}:${event.content}`);
    }

    expect(chunks).toEqual(['output:test-agent:stream']);
  });

  test('reset and dispose call lifecycle hooks', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.reset();
    expect(agent.resetCalls).toBe(1);
    expect(agent.getState()).toBe('idle');

    await agent.dispose();
    expect(agent.disposeCalls).toBe(1);
    expect(agent.getState()).toBe('idle');
  });
});
