import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentConfig, AgentContext, AgentResult } from '../types/agent';
import type {
  LLMCompletionOptions,
  LLMModel,
  LLMProvider,
  LLMResponse,
  LLMStreamChunk,
} from '../types/llm';
import type { Tool, ToolResult } from '../types/tool';
import { BaseAgent } from './base';
import { AgentOrchestrator } from './orchestrator';

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
    return [];
  }
}

class MockTool implements Tool {
  name = 'mock-tool';
  description = 'mock';
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

class MockAgent extends BaseAgent {
  public initializeCalls = 0;

  async execute(input: string): Promise<AgentResult> {
    this.ensureInitialized();
    return {
      success: true,
      message: 'ok',
      output: `${this.id}:${input}`,
    };
  }

  protected override async onInitialize(): Promise<void> {
    this.initializeCalls += 1;
  }
}

function createAgentConfig(name: string): AgentConfig {
  return {
    role: 'assistant',
    name,
    description: 'mock agent',
    systemPrompt: 'prompt',
    capabilities: {
      canExecuteTools: true,
      canStreamResponses: true,
      canAccessFiles: true,
      canAccessNetwork: false,
      canModifySystem: false,
      maxContextTokens: 4096,
    },
    llmProvider: 'mock-provider',
    model: 'mock-model',
  };
}

const context: AgentContext = {
  sessionId: 'session-1',
  workingDirectory: '/tmp',
  environmentVariables: {},
  metadata: {},
};

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let provider: MockProvider;
  let tool: MockTool;
  let agentA: MockAgent;
  let agentB: MockAgent;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
    provider = new MockProvider();
    tool = new MockTool();
    agentA = new MockAgent(createAgentConfig('agent-a'), 'agent-a');
    agentB = new MockAgent(createAgentConfig('agent-b'), 'agent-b');
  });

  test('registers and returns agents', () => {
    orchestrator.registerAgent(agentA);
    orchestrator.registerAgent(agentB);

    expect(orchestrator.getAgent('agent-a')).toBe(agentA);
    expect(orchestrator.getAgents()).toHaveLength(2);
  });

  test('rejects duplicate agent registration', () => {
    orchestrator.registerAgent(agentA);
    expect(() => orchestrator.registerAgent(agentA)).toThrow("Agent 'agent-a' is already registered");
  });

  test('initializes and executes through specific agent', async () => {
    orchestrator.registerAgent(agentA);
    await orchestrator.initializeAll(provider, [tool], context);

    const execution = await orchestrator.executeWithAgent({
      agentId: 'agent-a',
      input: 'task',
    });

    expect(agentA.initializeCalls).toBe(1);
    expect(execution.agentId).toBe('agent-a');
    expect(execution.result.success).toBe(true);
    expect(execution.result.output).toBe('agent-a:task');
    expect(execution.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('executes with all agents and pipeline', async () => {
    orchestrator.registerAgent(agentA);
    orchestrator.registerAgent(agentB);
    await orchestrator.initializeAll(provider, [tool], context);

    const allResults = await orchestrator.executeWithAll('broadcast-task');
    expect(allResults).toHaveLength(2);

    const pipelineResults = await orchestrator.runPipeline([
      { agentId: 'agent-a', input: 'step-1' },
      { agentId: 'agent-b', input: 'step-2' },
    ]);

    expect(pipelineResults).toHaveLength(2);
    expect(pipelineResults[0]?.result.output).toBe('agent-a:step-1');
    expect(pipelineResults[1]?.result.output).toBe('agent-b:step-2');
  });

  test('sends and broadcasts messages through orchestrator bus', async () => {
    orchestrator.registerAgent(agentA);
    orchestrator.registerAgent(agentB);

    const received: string[] = [];
    orchestrator.getBus().subscribeAgent('agent-b', (message) => {
      received.push(`${message.from}->${message.to}:${message.type}`);
    });

    const directMessage = await orchestrator.sendMessage(
      'agent-a',
      'agent-b',
      'handoff',
      { task: 'review' }
    );
    const broadcastMessage = await orchestrator.broadcastMessage(
      'agent-a',
      'status',
      'all good'
    );

    expect(directMessage.to).toBe('agent-b');
    expect(broadcastMessage.to).toBeUndefined();
    expect(received).toEqual(['agent-a->agent-b:handoff']);
  });

  test('unregisters agents and can dispose on unregister', async () => {
    orchestrator.registerAgent(agentA);
    await orchestrator.initializeAll(provider, [tool], context);

    const removed = await orchestrator.unregisterAgent('agent-a', true);
    const notFound = await orchestrator.unregisterAgent('agent-a', true);

    expect(removed).toBe(true);
    expect(notFound).toBe(false);
    expect(orchestrator.getAgents()).toHaveLength(0);
  });
});
