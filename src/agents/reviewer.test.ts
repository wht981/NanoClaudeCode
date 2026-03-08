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
  ReviewerAgent,
  type CodeReviewResult,
  type ReviewFinding,
  type ReviewSeverity,
  type ReviewCategory,
} from './reviewer';

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  readonly supportedModels: LLMModel[] = [];

  private mockResponse = 'Review completed';

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

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;
  let provider: MockLLMProvider;
  let tool: MockTool;

  beforeEach(() => {
    agent = ReviewerAgent.create();
    provider = new MockLLMProvider();
    tool = new MockTool();
  });

  test('creates agent with default configuration', () => {
    expect(agent.config.role).toBe('reviewer');
    expect(agent.config.name).toBe('ReviewerAgent');
    expect(agent.capabilities.canExecuteTools).toBe(true);
    expect(agent.capabilities.canAccessFiles).toBe(true);
    expect(agent.capabilities.canModifySystem).toBe(false);
  });

  test('creates agent with custom configuration', () => {
    const customAgent = ReviewerAgent.create({
      name: 'CustomReviewer',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(customAgent.config.name).toBe('CustomReviewer');
    expect(customAgent.config.model).toBe('gpt-3.5-turbo');
    expect(customAgent.config.temperature).toBe(0.5);
  });

  test('throws error when executing before initialization', async () => {
    await expect(
      agent.execute('function test() {}')
    ).rejects.toThrow('is not initialized');
  });

  test('reviews code successfully', async () => {
    provider.setMockResponse(`
## Summary
The code looks good overall with minor improvements needed.

## Findings
- Severity: minor, Category: readability, Message: Variable naming could be improved
- Severity: suggestion, Category: best-practices, Message: Consider adding JSDoc comments
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('function test() { return true; }', {
      language: 'typescript',
    });

    expect(result.success).toBe(true);
    expect(result.reviewed).toBe(true);
    expect(result.findings).toBeDefined();
    expect(result.findings!.length).toBeGreaterThan(0);
    expect(result.output).toContain('Overall rating: good');
  });

  test('parses structured findings correctly', async () => {
    provider.setMockResponse(`
## Summary
Security and performance issues found.

## Findings
- Severity: critical, Category: security, Message: SQL injection vulnerability detected
- Severity: major, Category: performance, Message: Inefficient loop detected
- Severity: minor, Category: maintainability, Message: Function is too long
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code here', {
      language: 'javascript',
    });

    expect(result.success).toBe(true);
    expect(result.findings!.length).toBe(3);

    const critical = result.findings!.find((f) => f.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.category).toBe('security');
    expect(critical!.message).toContain('SQL injection');

    const major = result.findings!.find((f) => f.severity === 'major');
    expect(major).toBeDefined();
    expect(major!.category).toBe('performance');
  });

  test('parses alternative finding formats', async () => {
    provider.setMockResponse(`
## Summary
Issues found

## Findings
[CRITICAL] (security) Potential XSS vulnerability
**MAJOR**: (performance) Memory leak in event handlers
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', { language: 'javascript' });

    expect(result.success).toBe(true);
    expect(result.findings!.length).toBeGreaterThan(0);
  });

  test('calculates quality metrics when requested', async () => {
    provider.setMockResponse(`
## Summary
Review completed

## Findings
- Severity: major, Category: security, Message: Issue 1
- Severity: minor, Category: performance, Message: Issue 2
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      language: 'typescript',
      includeMetrics: true,
    });

    expect(result.success).toBe(true);
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.metrics!.overallScore).toBeLessThanOrEqual(100);
    expect(result.metrics!.securityScore).toBeLessThan(100); // Should be reduced
    expect(result.metrics!.performanceScore).toBeLessThan(100); // Should be reduced
  });

  test('filters findings by minimum severity', async () => {
    provider.setMockResponse(`
## Findings
- Severity: critical, Category: security, Message: Critical issue
- Severity: major, Category: performance, Message: Major issue
- Severity: minor, Category: readability, Message: Minor issue
- Severity: suggestion, Category: best-practices, Message: Suggestion
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      minSeverity: 'major',
    });

    expect(result.success).toBe(true);
    const severities = result.findings!.map((f) => f.severity);
    expect(severities).toContain('critical');
    expect(severities).toContain('major');
    expect(severities).not.toContain('minor');
    expect(severities).not.toContain('suggestion');
  });

  test('filters findings by category', async () => {
    provider.setMockResponse(`
## Findings
- Severity: major, Category: security, Message: Security issue
- Severity: major, Category: performance, Message: Performance issue
- Severity: major, Category: readability, Message: Readability issue
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      categories: ['security', 'performance'],
    });

    expect(result.success).toBe(true);
    const categories = result.findings!.map((f) => f.category);
    expect(categories).toContain('security');
    expect(categories).toContain('performance');
    expect(categories).not.toContain('readability');
  });

  test('includes metadata in results', async () => {
    provider.setMockResponse(`
## Summary
Review done

## Findings
- Severity: critical, Category: security, Message: Issue 1
- Severity: major, Category: performance, Message: Issue 2
- Severity: minor, Category: readability, Message: Issue 3
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      language: 'typescript',
    });

    expect(result.metadata?.language).toBe('typescript');
    expect(result.metadata?.totalFindings).toBe(3);
    expect(result.metadata?.criticalFindings).toBe(1);
    expect(result.metadata?.majorFindings).toBe(1);
    expect(result.metadata?.minorFindings).toBe(1);
  });

  test('handles review with no findings', async () => {
    provider.setMockResponse(`
## Summary
Code looks excellent! No issues found.
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', { language: 'typescript' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('excellent');
  });

  test('streams review output', async () => {
    provider.setMockResponse('The code has several issues that need attention');

    await agent.initialize(provider, [tool], createContext());

    const chunks: string[] = [];
    for await (const event of agent.executeStream('code', {
      language: 'typescript',
    })) {
      chunks.push(event.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('issues');
  });

  test('uses reviewCode convenience method', async () => {
    provider.setMockResponse('## Summary\nCode reviewed successfully');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.reviewCode('function test() {}', {
      language: 'typescript',
    });

    expect(result.success).toBe(true);
    expect(result.reviewed).toBe(true);
  });

  test('uses reviewSecurity convenience method', async () => {
    provider.setMockResponse(`
## Summary
Security analysis complete

## Findings
- Severity: critical, Category: security, Message: XSS vulnerability found
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.reviewSecurity(
      'function render(html) { div.innerHTML = html; }',
      'javascript'
    );

    expect(result.success).toBe(true);
    expect(result.language).toBe('javascript');
    const securityFindings = result.findings!.filter(
      (f) => f.category === 'security'
    );
    expect(securityFindings.length).toBeGreaterThan(0);
  });

  test('uses reviewPerformance convenience method', async () => {
    provider.setMockResponse(`
## Summary
Performance analysis complete

## Findings
- Severity: major, Category: performance, Message: O(n^2) loop detected
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.reviewPerformance(
      'for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) {} }',
      'javascript'
    );

    expect(result.success).toBe(true);
    const perfFindings = result.findings!.filter(
      (f) => f.category === 'performance'
    );
    expect(perfFindings.length).toBeGreaterThan(0);
  });

  test('uses assessQuality convenience method', async () => {
    provider.setMockResponse(`
## Summary
Quality assessment complete

## Findings
- Severity: minor, Category: maintainability, Message: Consider refactoring
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.assessQuality('code', 'typescript');

    expect(result.success).toBe(true);
    expect(result.metrics).toBeDefined();
  });

  test('normalizes severity levels correctly', async () => {
    provider.setMockResponse(`
## Findings
- Severity: high, Category: security, Message: High priority issue
- Severity: medium, Category: performance, Message: Medium priority issue
- Severity: low, Category: readability, Message: Low priority issue
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code');

    expect(result.success).toBe(true);
    
    // High -> critical, medium -> major, low -> minor
    const severities = result.findings!.map((f) => f.severity);
    expect(severities).toContain('critical');
    expect(severities).toContain('major');
    expect(severities).toContain('minor');
  });

  test('normalizes category aliases correctly', async () => {
    provider.setMockResponse(`
## Findings
- Severity: major, Category: sec, Message: Security issue
- Severity: major, Category: perf, Message: Performance issue
- Severity: major, Category: docs, Message: Documentation issue
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code');

    expect(result.success).toBe(true);
    
    const categories = result.findings!.map((f) => f.category);
    expect(categories).toContain('security');
    expect(categories).toContain('performance');
    expect(categories).toContain('documentation');
  });

  test('handles execution errors gracefully', async () => {
    await agent.initialize(provider, [tool], createContext());

    // Simulate error by making provider throw
    const originalComplete = provider.complete.bind(provider);
    provider.complete = async () => {
      throw new Error('LLM error');
    };

    const result = await agent.execute('code', {
      language: 'typescript',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM error');
    expect(result.reviewed).toBe(false);
    expect(agent.getState()).toBe('error');

    // Restore
    provider.complete = originalComplete;
  });

  test('respects strict mode option', async () => {
    provider.setMockResponse('## Summary\nStrict review completed');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      strictMode: true,
    });

    expect(result.success).toBe(true);
  });

  test('respects check options', async () => {
    provider.setMockResponse('## Summary\nSecurity-only review');

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      checkSecurity: true,
      checkPerformance: false,
      checkStyle: false,
    });

    expect(result.success).toBe(true);
  });

  test('calculates overall score correctly', async () => {
    provider.setMockResponse(`
## Findings
- Severity: critical, Category: security, Message: Critical issue
- Severity: major, Category: performance, Message: Major issue
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      includeMetrics: true,
    });

    expect(result.metrics).toBeDefined();
    
    // With critical and major issues, scores should be reduced
    expect(result.metrics!.securityScore).toBeLessThanOrEqual(90);
    expect(result.metrics!.performanceScore).toBeLessThan(95);
    expect(result.metrics!.overallScore).toBeLessThan(100);
    
    // But other categories should be higher
    expect(result.metrics!.readabilityScore).toBeGreaterThan(90);
  });

  test('resets agent state properly', async () => {
    await agent.initialize(provider, [tool], createContext());

    await agent.execute('code', { language: 'typescript' });
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
      agent.execute('code')
    ).rejects.toThrow('is not initialized');
  });

  test('maps review categories to metric categories correctly', async () => {
    provider.setMockResponse(`
## Findings
- Severity: major, Category: testing, Message: Test issue
- Severity: major, Category: documentation, Message: Doc issue
- Severity: major, Category: architecture, Message: Arch issue
- Severity: major, Category: accessibility, Message: A11y issue
    `);

    await agent.initialize(provider, [tool], createContext());

    const result = await agent.execute('code', {
      includeMetrics: true,
    });

    expect(result.metrics).toBeDefined();
    
    // Testing -> reliability
    expect(result.metrics!.reliabilityScore).toBeLessThan(100);
    
    // Documentation, architecture -> maintainability
    expect(result.metrics!.maintainabilityScore).toBeLessThan(100);
    
    // Accessibility -> readability
    expect(result.metrics!.readabilityScore).toBeLessThan(100);
  });

  test('handles different severity weights in metric calculation', async () => {
    provider.setMockResponse(`
## Findings
- Severity: critical, Category: security, Message: Critical
    `);

    await agent.initialize(provider, [tool], createContext());

    const criticalResult = await agent.execute('code', {
      includeMetrics: true,
    });

    provider.setMockResponse(`
## Findings
- Severity: minor, Category: security, Message: Minor
    `);

    const minorResult = await agent.execute('code', {
      includeMetrics: true,
    });

    // Critical should reduce score more than minor
    expect(criticalResult.metrics!.securityScore).toBeLessThan(
      minorResult.metrics!.securityScore
    );
  });
});
