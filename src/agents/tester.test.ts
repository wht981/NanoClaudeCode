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
  TesterAgent,
  type TestGenerationResult,
  type TestFramework,
} from './tester';

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly supportedModels: LLMModel[] = [];

  private mockResponse = `## Test Cases
[TEST:test-1] Name: should add two numbers correctly
Type: unit
Description: Verifies that the add function returns correct sum
Assertions: result equals 5
\`\`\`typescript
test('should add two numbers correctly', () => {
  const result = add(2, 3);
  expect(result).toBe(5);
});
\`\`\`

[TEST:test-2] Name: should handle negative numbers
Type: unit
Description: Verifies addition with negative numbers
Assertions: result equals -1
\`\`\`typescript
test('should handle negative numbers', () => {
  const result = add(2, -3);
  expect(result).toBe(-1);
});
\`\`\`

## Coverage Analysis
Estimated Coverage: 85
Covered Scenarios:
- Positive number addition
- Negative number addition
Uncovered Scenarios:
- Large number handling
- Float precision

## Recommendations
- Add tests for edge cases with very large numbers
- Consider testing with floating point numbers`;

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

describe('TesterAgent', () => {
  let agent: TesterAgent;
  let provider: MockLLMProvider;
  let tool: MockTool;

  beforeEach(() => {
    agent = TesterAgent.create();
    provider = new MockLLMProvider();
    tool = new MockTool();
  });

  test('creates agent with default configuration', () => {
    expect(agent.config.role).toBe('tester');
    expect(agent.config.name).toBe('TesterAgent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.capabilities.canAccessFiles).toBe(true);
  });

  test('creates agent with custom configuration', () => {
    const customAgent = TesterAgent.create({
      name: 'CustomTester',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(customAgent.config.name).toBe('CustomTester');
    expect(customAgent.config.model).toBe('gpt-3.5-turbo');
    expect(customAgent.config.temperature).toBe(0.5);
  });

  test('throws error when executing before initialization', async () => {
    await expect(
      agent.execute('generate tests')
    ).rejects.toThrow('is not initialized');
  });

  test('generates tests successfully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('function add(a, b) { return a + b; }', {
      framework: 'vitest',
      testType: 'unit',
    });

    expect(result.success).toBe(true);
    expect(result.testCases).toBeDefined();
    expect(result.testCases!.length).toBeGreaterThan(0);
    expect(result.framework).toBe('vitest');
  });

  test('parses test cases correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(true);
    expect(result.testCases!.length).toBe(2);
    expect(result.testCases![0].id).toBe('test-1');
    expect(result.testCases![0].name).toBe('should add two numbers correctly');
    expect(result.testCases![0].type).toBe('unit');
    expect(result.testCases![0].code).toContain('expect(result).toBe(5)');
  });

  test('parses coverage analysis correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(true);
    expect(result.coverageAnalysis).toBeDefined();
    expect(result.coverageAnalysis!.estimatedCoverage).toBe(85);
    expect(result.coverageAnalysis!.coveredScenarios.length).toBeGreaterThan(0);
    expect(result.coverageAnalysis!.uncoveredScenarios.length).toBeGreaterThan(0);
  });

  test('parses recommendations correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(true);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations!.length).toBeGreaterThan(0);
    expect(result.recommendations![0]).toContain('edge cases');
  });

  test('generates metadata statistics', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.totalTests).toBe(2);
    expect(result.metadata!.testsByType.unit).toBe(2);
  });

  test('uses generateTests convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const framework: TestFramework = 'jest';
    const result = await agent.generateTests(
      'function multiply(a, b) { return a * b; }',
      framework
    );

    expect(result.success).toBe(true);
  });

  test('uses generateUnitTests convenience method', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.generateUnitTests(
      'function divide(a, b) { return a / b; }'
    );

    expect(result.success).toBe(true);
  });

  test('uses generateIntegrationTests convenience method', async () => {
    provider.setMockResponse(`## Test Cases
[TEST:int-1] Name: should integrate with database
Type: integration
Description: Tests database integration
Assertions: data is saved
\`\`\`typescript
test('should integrate with database', async () => {
  const result = await saveToDb({ name: 'test' });
  expect(result).toBeDefined();
});
\`\`\`

## Coverage Analysis
Estimated Coverage: 70
Covered Scenarios:
- Database save operation
Uncovered Scenarios:
- Database error handling

## Recommendations
- Add error handling tests`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.generateIntegrationTests(
      'Test user registration flow'
    );

    expect(result.success).toBe(true);
  });

  test('formats test output correctly', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.output).toContain('# Generated Tests');
    expect(result.output).toContain('## Test Cases');
    expect(result.output).toContain('## Coverage Analysis');
    expect(result.output).toContain('## Recommendations');
    expect(result.output).toContain('```typescript');
  });

  test('handles multiple test types', async () => {
    provider.setMockResponse(`## Test Cases
[TEST:t1] Name: unit test
Type: unit
Description: Unit test
Assertions: works
\`\`\`typescript
test('unit', () => expect(true).toBe(true));
\`\`\`

[TEST:t2] Name: integration test
Type: integration
Description: Integration test
Assertions: integrates
\`\`\`typescript
test('integration', async () => expect(await fn()).toBe(true));
\`\`\`

[TEST:t3] Name: e2e test
Type: e2e
Description: E2E test
Assertions: end to end works
\`\`\`typescript
test('e2e', async () => expect(await page.title()).toBe('Test'));
\`\`\`

## Coverage Analysis
Estimated Coverage: 90
Covered Scenarios:
- All scenarios
Uncovered Scenarios:

## Recommendations
- Looks good`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate comprehensive tests');

    expect(result.success).toBe(true);
    expect(result.testCases!.length).toBe(3);
    expect(result.metadata!.testsByType.unit).toBe(1);
    expect(result.metadata!.testsByType.integration).toBe(1);
    expect(result.metadata!.testsByType.e2e).toBe(1);
  });

  test('handles empty test generation', async () => {
    provider.setMockResponse(`## Test Cases

## Coverage Analysis
Estimated Coverage: 0
Covered Scenarios:
Uncovered Scenarios:
- Everything needs testing

## Recommendations
- Write some tests`);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(true);
    expect(result.testCases!.length).toBe(0);
    expect(result.metadata!.totalTests).toBe(0);
  });

  test('streams test generation results', async () => {
    await agent.initialize(provider, [tool], createContext());

    const chunks: string[] = [];
    for await (const event of agent.executeStream('generate tests')) {
      chunks.push(event.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Test');
  });

  test('handles execution errors gracefully', async () => {
    await agent.initialize(provider, [tool], createContext());

    const originalComplete = provider.complete.bind(provider);
    provider.complete = async () => {
      throw new Error('Test generation error');
    };

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Test generation error');
    expect(agent.getState()).toBe('error');

    provider.complete = originalComplete;
  });

  test('respects custom test options', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests', {
      testType: 'unit',
      framework: 'jest',
      coverageLevel: 'comprehensive',
      includeEdgeCases: true,
      includeMocks: true,
      generateFixtures: true,
    });

    expect(result.success).toBe(true);
  });

  test('supports different test frameworks', async () => {
    await agent.initialize(provider, [tool], createContext());

    const frameworks: TestFramework[] = ['jest', 'vitest', 'mocha', 'pytest', 'bun:test'];

    for (const framework of frameworks) {
      const result = await agent.generateTests('test code', framework);
      expect(result.success).toBe(true);
      expect(result.framework).toBe(framework);
    }
  });

  test('includes assertions in test cases', async () => {
    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('generate tests');

    expect(result.success).toBe(true);
    expect(result.testCases![0].assertions.length).toBeGreaterThan(0);
    expect(result.testCases![0].assertions[0]).toContain('result equals');
  });

  test('resets agent state properly', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.execute('generate tests');
    expect(agent.getState()).toBe('idle');

    await agent.reset();
    expect(agent.getState()).toBe('idle');
  });

  test('disposes agent resources', async () => {
    await agent.initialize(provider, [tool], createContext());
    await agent.dispose();

    expect(agent.getState()).toBe('idle');

    await expect(
      agent.execute('generate tests')
    ).rejects.toThrow('is not initialized');
  });
});
