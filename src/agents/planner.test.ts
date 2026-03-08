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
  PlannerAgent,
  type PlanningResult,
  type PlanningScope,
} from './planner';

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly supportedModels: LLMModel[] = [];

  private mockResponse = `## Tasks
[TASK:task-1] Title: Setup project structure
Priority: high
Description: Initialize repository and configure tooling
Estimated Hours: 4
Dependencies:

[TASK:task-2] Title: Implement core feature
Priority: critical
Description: Build main functionality
Estimated Hours: 16
Dependencies: task-1

## Milestones
[MILESTONE:m1] Title: MVP Complete
Description: First working version
Tasks: task-1, task-2

## Timeline
Project timeline: 1 week with 2 developers

## Risks
- Technical complexity may increase estimates
- Third-party API dependencies

## Recommendations
- Start with task-1 immediately
- Plan buffer time for unknowns`;

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

describe('PlannerAgent', () => {
  let agent: PlannerAgent;
  let provider: MockLLMProvider;
  let tool: MockTool;

  beforeEach(() => {
    agent = PlannerAgent.create();
    provider = new MockLLMProvider();
    tool = new MockTool();
  });

  test('creates agent with default configuration', () => {
    expect(agent.config.role).toBe('custom');
    expect(agent.config.name).toBe('PlannerAgent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.capabilities.canAccessFiles).toBe(true);
  });

  test('creates agent with custom configuration', () => {
    const customAgent = PlannerAgent.create({
      name: 'CustomPlanner',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(customAgent.config.name).toBe('CustomPlanner');
    expect(customAgent.config.model).toBe('gpt-3.5-turbo');
    expect(customAgent.config.temperature).toBe(0.5);
  });

  test('throws error when executing before initialization', async () => {
    await expect(
      agent.execute('plan a feature')
    ).rejects.toThrow('is not initialized');
  });

  test('creates project plan successfully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('Build user authentication system', {
      scope: 'feature',
    });

    expect(result.success).toBe(true);
    expect(result.tasks).toBeDefined();
    expect(result.tasks!.length).toBeGreaterThan(0);
    expect(result.milestones).toBeDefined();
    expect(result.timeline).toBeDefined();
  });

  test('parses tasks correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.success).toBe(true);
    expect(result.tasks!.length).toBe(2);
    expect(result.tasks![0].id).toBe('task-1');
    expect(result.tasks![0].title).toBe('Setup project structure');
    expect(result.tasks![0].priority).toBe('high');
    expect(result.tasks![0].estimatedHours).toBe(4);
    expect(result.tasks![1].dependencies).toContain('task-1');
  });

  test('parses milestones correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.success).toBe(true);
    expect(result.milestones!.length).toBe(1);
    expect(result.milestones![0].id).toBe('m1');
    expect(result.milestones![0].title).toBe('MVP Complete');
    expect(result.milestones![0].tasks).toContain('task-1');
    expect(result.milestones![0].tasks).toContain('task-2');
  });

  test('parses risks and recommendations', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.success).toBe(true);
    expect(result.risks!.length).toBe(2);
    expect(result.risks![0]).toContain('Technical complexity');
    expect(result.recommendations!.length).toBe(2);
    expect(result.recommendations![0]).toContain('Start with task-1');
  });

  test('generates metadata statistics', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.totalTasks).toBe(2);
    expect(result.metadata!.totalEstimatedHours).toBe(20);
    expect(result.metadata!.tasksByPriority.critical).toBe(1);
    expect(result.metadata!.tasksByPriority.high).toBe(1);
  });

  test('uses createPlan convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const scope: PlanningScope = 'sprint';
    const result = await agent.createPlan('Complete authentication feature', scope);

    expect(result.success).toBe(true);
  });

  test('uses planFeature convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.planFeature('Add dark mode support');

    expect(result.success).toBe(true);
  });

  test('uses planSprint convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.planSprint('Sprint 1: Core features');

    expect(result.success).toBe(true);
  });

  test('formats plan output correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.output).toContain('# Project Plan');
    expect(result.output).toContain('## Tasks');
    expect(result.output).toContain('## Milestones');
    expect(result.output).toContain('## Timeline');
    expect(result.output).toContain('## Risks');
    expect(result.output).toContain('## Recommendations');
  });

  test('handles plan with no milestones', async () => {
    provider.setMockResponse(`## Tasks
[TASK:task-1] Title: Simple task
Priority: medium
Description: Do something
Estimated Hours: 2

## Timeline
Quick timeline

## Risks
- No major risks

## Recommendations
- Just do it`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan simple feature');

    expect(result.success).toBe(true);
    expect(result.milestones!.length).toBe(0);
  });

  test('handles plan with multiple priorities', async () => {
    provider.setMockResponse(`## Tasks
[TASK:t1] Title: Critical Task
Priority: critical
Description: Must do
Estimated Hours: 8

[TASK:t2] Title: Low priority task
Priority: low
Description: Nice to have
Estimated Hours: 2

[TASK:t3] Title: Medium task
Priority: medium
Description: Should do
Estimated Hours: 4

## Timeline
Mixed priority timeline

## Risks
- Priority conflicts

## Recommendations
- Focus on critical first`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project');

    expect(result.success).toBe(true);
    expect(result.metadata!.tasksByPriority.critical).toBe(1);
    expect(result.metadata!.tasksByPriority.low).toBe(1);
    expect(result.metadata!.tasksByPriority.medium).toBe(1);
  });

  test('streams planning results', async () => {
    await agent.initialize(provider, [tool], createContext());

    const chunks: string[] = [];
    for await (const event of agent.executeStream('plan project')) {
      chunks.push(event.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Tasks');
  });

  test('handles execution errors gracefully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const originalComplete = provider.complete.bind(provider);
    provider.complete = async () => {
      throw new Error('Planning error');
    };

    const result = await agent.execute('plan project');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Planning error');
    expect(agent.getState()).toBe('error');

    provider.complete = originalComplete;
  });

  test('respects custom planning options', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan project', {
      scope: 'project',
      timeframe: '3 months',
      constraints: ['Budget: $50k', 'Team: 3 developers'],
      includeMilestones: true,
      estimateEffort: true,
    });

    expect(result.success).toBe(true);
  });

  test('handles complex task dependencies', async () => {
    provider.setMockResponse(`## Tasks
[TASK:t1] Title: Foundation
Priority: critical
Description: Base work
Estimated Hours: 8
Dependencies:

[TASK:t2] Title: Feature A
Priority: high
Description: Build feature A
Estimated Hours: 12
Dependencies: t1

[TASK:t3] Title: Feature B
Priority: high
Description: Build feature B
Estimated Hours: 10
Dependencies: t1, t2

## Timeline
Sequential timeline

## Risks
- Dependency delays

## Recommendations
- Parallelize where possible`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('plan complex project');

    expect(result.success).toBe(true);
    expect(result.tasks![2].dependencies).toContain('t1');
    expect(result.tasks![2].dependencies).toContain('t2');
  });

  test('resets agent state properly', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.execute('plan project');
    expect(agent.getState()).toBe('idle');

    await agent.reset();
    expect(agent.getState()).toBe('idle');
  });

  test('disposes agent resources', async () => {
    await agent.initialize(provider, [tool], createContext());
    await agent.dispose();

    expect(agent.getState()).toBe('idle');

    await expect(
      agent.execute('plan project')
    ).rejects.toThrow('is not initialized');
  });
});
