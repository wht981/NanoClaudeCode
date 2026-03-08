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
  ResearcherAgent,
  type ResearchResult,
  type ResearchSource,
} from './researcher';

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly supportedModels: LLMModel[] = [];

  private mockResponse = `## Summary
TypeScript is a strongly typed superset of JavaScript.

## Findings
[SOURCE: documentation] Title: TypeScript Official Docs
Relevance: 0.95
Content: TypeScript adds static typing to JavaScript
URL: https://www.typescriptlang.org

## Recommendations
- Use strict mode for better type safety
- Enable noImplicitAny for cleaner code`;

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

describe('ResearcherAgent', () => {
  let agent: ResearcherAgent;
  let provider: MockLLMProvider;
  let tool: MockTool;

  beforeEach(() => {
    agent = ResearcherAgent.create();
    provider = new MockLLMProvider();
    tool = new MockTool();
  });

  test('creates agent with default configuration', () => {
    expect(agent.config.role).toBe('custom');
    expect(agent.config.name).toBe('ResearcherAgent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.capabilities.canAccessNetwork).toBe(true);
  });

  test('creates agent with custom configuration', () => {
    const customAgent = ResearcherAgent.create({
      name: 'CustomResearcher',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(customAgent.config.name).toBe('CustomResearcher');
    expect(customAgent.config.model).toBe('gpt-3.5-turbo');
    expect(customAgent.config.temperature).toBe(0.5);
  });

  test('throws error when executing before initialization', async () => {
    await expect(
      agent.execute('research TypeScript')
    ).rejects.toThrow('is not initialized');
  });

  test('performs research successfully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('What is TypeScript?', {
      sources: ['documentation'],
    });

    expect(result.success).toBe(true);
    expect(result.findings).toBeDefined();
    expect(result.findings!.length).toBeGreaterThan(0);
    expect(result.summary).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  test('parses research findings correctly', async () => {
    provider.setMockResponse(`## Summary
React is a UI library.

## Findings
[SOURCE: documentation] Title: React Docs
Relevance: 0.9
Content: React is declarative and component-based
URL: https://react.dev

[SOURCE: code-examples] Title: React Examples
Relevance: 0.85
Content: useState and useEffect are core hooks

## Recommendations
- Start with functional components
- Learn hooks thoroughly`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research React');

    expect(result.success).toBe(true);
    expect(result.findings!.length).toBe(2);
    expect(result.findings![0].source).toBe('documentation');
    expect(result.findings![0].relevance).toBe(0.9);
    expect(result.findings![0].url).toBe('https://react.dev');
    expect(result.recommendations!.length).toBe(2);
  });

  test('generates metadata statistics', async () => {
    provider.setMockResponse(`## Summary
Test summary

## Findings
[SOURCE: documentation] Title: Doc 1
Relevance: 0.8
Content: Content 1

[SOURCE: documentation] Title: Doc 2
Relevance: 0.6
Content: Content 2

[SOURCE: code-examples] Title: Example 1
Relevance: 0.9
Content: Example content

## Recommendations
- Test recommendation`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research topic');

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.totalFindings).toBe(3);
    expect(result.metadata!.averageRelevance).toBeCloseTo(0.77, 1);
    expect(result.metadata!.sourceBreakdown.documentation).toBe(2);
    expect(result.metadata!.sourceBreakdown['code-examples']).toBe(1);
  });

  test('uses research convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const sources: ResearchSource[] = ['documentation', 'best-practices'];
    const result = await agent.research('TypeScript patterns', sources);

    expect(result.success).toBe(true);
  });

  test('uses quickResearch convenience method', async () => {
    provider.setMockResponse(`## Summary
Quick answer

## Findings
[SOURCE: documentation] Title: Quick Doc
Relevance: 0.7
Content: Quick content

## Recommendations
- Quick tip`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.quickResearch('What is async/await?');

    expect(result.success).toBe(true);
  });

  test('uses deepResearch convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.deepResearch('System design patterns');

    expect(result.success).toBe(true);
  });

  test('formats research output correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research topic');

    expect(result.output).toContain('## Summary');
    expect(result.output).toContain('## Findings');
    expect(result.output).toContain('## Recommendations');
    expect(result.output).toContain('TypeScript');
  });

  test('handles empty findings', async () => {
    provider.setMockResponse(`## Summary
No findings available

## Findings

## Recommendations`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research obscure topic');

    expect(result.success).toBe(true);
    expect(result.findings!.length).toBe(0);
    expect(result.metadata!.totalFindings).toBe(0);
  });

  test('streams research results', async () => {
    await agent.initialize(provider, [tool], createContext());

    const chunks: string[] = [];
    for await (const event of agent.executeStream('research topic')) {
      chunks.push(event.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('TypeScript');
  });

  test('handles execution errors gracefully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const originalComplete = provider.complete.bind(provider);
    provider.complete = async () => {
      throw new Error('Research error');
    };

    const result = await agent.execute('research topic');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Research error');
    expect(agent.getState()).toBe('error');

    provider.complete = originalComplete;
  });

  test('includes all metadata fields', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research topic');

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.totalFindings).toBeGreaterThanOrEqual(0);
    expect(result.metadata!.averageRelevance).toBeGreaterThanOrEqual(0);
    expect(result.metadata!.sourceBreakdown).toBeDefined();
  });

  test('respects custom research options', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('research topic', {
      depth: 'deep',
      maxResults: 10,
      includeExamples: true,
      verifyInformation: true,
    });

    expect(result.success).toBe(true);
  });

  test('resets agent state properly', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.execute('research topic');
    expect(agent.getState()).toBe('idle');

    await agent.reset();
    expect(agent.getState()).toBe('idle');
  });

  test('disposes agent resources', async () => {
    await agent.initialize(provider, [tool], createContext());
    await agent.dispose();

    expect(agent.getState()).toBe('idle');

    await expect(
      agent.execute('research topic')
    ).rejects.toThrow('is not initialized');
  });
});
