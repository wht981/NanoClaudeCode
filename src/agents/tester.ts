import type {
  AgentConfig,
  AgentResult,
} from '../types/agent';
import type { Message } from '../types/message';
import { BaseAgent } from './base';

/**
 * Test types
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'security';

/**
 * Test framework
 */
export type TestFramework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'jasmine'
  | 'pytest'
  | 'junit'
  | 'bun:test'
  | 'custom';

/**
 * Test coverage level
 */
export type CoverageLevel = 'minimal' | 'standard' | 'comprehensive';

/**
 * Test case
 */
export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: TestType;
  code: string;
  assertions: string[];
  setup?: string;
  teardown?: string;
}

/**
 * TesterAgent options
 */
export interface TesterAgentOptions {
  testType?: TestType;
  framework?: TestFramework;
  coverageLevel?: CoverageLevel;
  maxIterations?: number;
  contextMessages?: Message[];
  includeEdgeCases?: boolean;
  includeMocks?: boolean;
  generateFixtures?: boolean;
}

/**
 * Test generation result
 */
export interface TestGenerationResult extends AgentResult {
  testCases?: TestCase[];
  framework?: TestFramework;
  coverageAnalysis?: {
    estimatedCoverage: number;
    coveredScenarios: string[];
    uncoveredScenarios: string[];
  };
  recommendations?: string[];
  metadata?: {
    totalTests: number;
    testsByType: Record<string, number>;
    estimatedRuntime?: string;
  };
}

/**
 * TesterAgent specialized for test generation and analysis.
 * Creates comprehensive test suites with various testing strategies.
 */
export class TesterAgent extends BaseAgent {
  private testIdCounter = 0;

  /**
   * Create a TesterAgent with specific configuration
   */
  static create(config?: Partial<AgentConfig>): TesterAgent {
    const defaultConfig: AgentConfig = {
      role: 'tester',
      name: 'TesterAgent',
      description: 'Specialized agent for test generation and quality assurance',
      systemPrompt: `You are an expert test engineer specializing in comprehensive test generation and quality assurance.
Your responsibilities include:
- Generating thorough test cases for all scenarios
- Writing clear, maintainable test code
- Identifying edge cases and boundary conditions
- Creating appropriate test fixtures and mocks
- Ensuring good test coverage
- Following testing best practices
- Recommending testing strategies
- Balancing test thoroughness with maintainability

When generating tests:
1. Cover happy paths and error cases
2. Test boundary conditions and edge cases
3. Use descriptive test names that explain intent
4. Keep tests focused and independent
5. Use appropriate mocking and stubbing
6. Include setup and teardown when needed
7. Follow AAA pattern (Arrange, Act, Assert)
8. Make assertions specific and meaningful`,
      capabilities: {
        canExecuteTools: true,
        canStreamResponses: true,
        canAccessFiles: true,
        canAccessNetwork: false,
        canModifySystem: false,
        maxContextTokens: 16384,
      },
      llmProvider: 'openai',
      model: 'gpt-4',
      temperature: 0.2,
      maxTokens: 4096,
      tools: ['read_file', 'write_file', 'list_files', 'execute_command'],
    };

    return new TesterAgent({ ...defaultConfig, ...config });
  }

  /**
   * Execute a test generation task
   */
  async execute(
    input: string,
    options?: TesterAgentOptions
  ): Promise<TestGenerationResult> {
    this.ensureInitialized();
    this.setState('thinking');

    try {
      const testType = options?.testType ?? 'unit';
      const framework = options?.framework ?? 'vitest';
      const coverageLevel = options?.coverageLevel ?? 'standard';

      const enhancedPrompt = this.buildTestPrompt(
        input,
        testType,
        framework,
        coverageLevel,
        options
      );

      const messages: Message[] = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      const response = await this.llmProvider!.complete({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.2,
        maxTokens: this.config.maxTokens ?? 4096,
      });

      const parsed = this.parseTestResponse(response.content, framework);
      const metadata = this.generateMetadata(parsed.testCases);

      this.setState('idle');

      return this.createTestSuccessResult(
        'Test generation completed successfully',
        parsed.testCases,
        framework,
        parsed.coverageAnalysis,
        parsed.recommendations,
        metadata
      );
    } catch (error) {
      this.setState('error');
      return this.createTestErrorResult(
        'Test generation failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Stream test generation results
   */
  override async *executeStream(
    input: string,
    options?: TesterAgentOptions
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    this.ensureInitialized();
    this.setState('thinking');

    yield {
      type: 'thinking',
      content: 'Generating test cases...',
    };

    try {
      const testType = options?.testType ?? 'unit';
      const framework = options?.framework ?? 'vitest';
      const coverageLevel = options?.coverageLevel ?? 'standard';

      const enhancedPrompt = this.buildTestPrompt(
        input,
        testType,
        framework,
        coverageLevel,
        options
      );

      const messages: Message[] = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      for await (const chunk of this.llmProvider!.streamComplete({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.2,
        maxTokens: this.config.maxTokens ?? 4096,
      })) {
        yield {
          type: 'output',
          content: chunk.content,
        };
      }

      this.setState('idle');
    } catch (error) {
      this.setState('error');
      yield {
        type: 'output',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate tests for code
   */
  async generateTests(
    code: string,
    framework: TestFramework,
    options?: Omit<TesterAgentOptions, 'framework'>
  ): Promise<TestGenerationResult> {
    return this.execute(code, {
      ...options,
      framework,
    });
  }

  /**
   * Generate unit tests
   */
  async generateUnitTests(
    code: string,
    options?: Omit<TesterAgentOptions, 'testType'>
  ): Promise<TestGenerationResult> {
    return this.execute(code, {
      ...options,
      testType: 'unit',
      includeEdgeCases: true,
    });
  }

  /**
   * Generate integration tests
   */
  async generateIntegrationTests(
    description: string,
    options?: Omit<TesterAgentOptions, 'testType'>
  ): Promise<TestGenerationResult> {
    return this.execute(description, {
      ...options,
      testType: 'integration',
      includeMocks: true,
    });
  }

  /**
   * Build test generation prompt
   */
  private buildTestPrompt(
    input: string,
    testType: TestType,
    framework: TestFramework,
    coverageLevel: CoverageLevel,
    options?: TesterAgentOptions
  ): string {
    const parts: string[] = [];

    parts.push(`Generate ${testType} tests using ${framework} for:`);
    parts.push('');
    parts.push(input);
    parts.push('');

    parts.push(`Coverage level: ${coverageLevel}`);

    if (options?.includeEdgeCases) {
      parts.push('Include edge cases and boundary conditions');
    }

    if (options?.includeMocks) {
      parts.push('Include appropriate mocks and stubs');
    }

    if (options?.generateFixtures) {
      parts.push('Generate test fixtures and sample data');
    }

    parts.push('');
    parts.push('Structure your response as:');
    parts.push('## Test Cases');
    parts.push('[TEST:test-1] Name: <descriptive_test_name>');
    parts.push('Type: unit|integration|e2e|performance|security');
    parts.push('Description: <what_this_test_verifies>');
    parts.push('Assertions: <key_assertions>');
    parts.push('```' + this.getLanguageForFramework(framework));
    parts.push('<test_code>');
    parts.push('```');
    parts.push('');
    parts.push('## Coverage Analysis');
    parts.push('Estimated Coverage: <percentage>');
    parts.push('Covered Scenarios:');
    parts.push('- <scenario_1>');
    parts.push('Uncovered Scenarios:');
    parts.push('- <scenario_1>');
    parts.push('');
    parts.push('## Recommendations');
    parts.push('- <testing_recommendations>');

    return parts.join('\n');
  }

  /**
   * Parse test response
   */
  private parseTestResponse(
    content: string,
    framework: TestFramework
  ): {
    testCases: TestCase[];
    coverageAnalysis: TestGenerationResult['coverageAnalysis'];
    recommendations: string[];
  } {
    const testCases: TestCase[] = [];
    const recommendations: string[] = [];
    let coverageAnalysis: TestGenerationResult['coverageAnalysis'] = {
      estimatedCoverage: 0,
      coveredScenarios: [],
      uncoveredScenarios: [],
    };

    const lines = content.split('\n');
    let section: 'none' | 'tests' | 'coverage' | 'recommendations' = 'none';
    let currentTest: Partial<TestCase> | null = null;
    let inCodeBlock = false;
    let codeLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (trimmed.startsWith('## Test Cases')) {
        section = 'tests';
        continue;
      } else if (trimmed.startsWith('## Coverage Analysis')) {
        section = 'coverage';
        continue;
      } else if (trimmed.startsWith('## Recommendations')) {
        section = 'recommendations';
        continue;
      }

      // Parse test cases
      if (section === 'tests') {
        const testMatch = trimmed.match(/\[TEST:([^\]]+)\]\s*Name:\s*(.+)/i);
        if (testMatch) {
          if (currentTest && codeLines.length > 0) {
            currentTest.code = codeLines.join('\n');
            testCases.push(currentTest as TestCase);
            codeLines = [];
          }
          currentTest = {
            id: testMatch[1],
            name: testMatch[2],
            description: '',
            type: 'unit',
            code: '',
            assertions: [],
          };
          continue;
        }

        if (currentTest) {
          const typeMatch = trimmed.match(/Type:\s*(unit|integration|e2e|performance|security)/i);
          if (typeMatch) {
            currentTest.type = (typeMatch[1] ?? 'unit').toLowerCase() as TestType;
            continue;
          }

          const descMatch = trimmed.match(/Description:\s*(.+)/i);
          if (descMatch) {
            currentTest.description = descMatch[1] ?? '';
            continue;
          }

          const assertMatch = trimmed.match(/Assertions?:\s*(.+)/i);
          if (assertMatch) {
            currentTest.assertions = (assertMatch[1] ?? '').split(',').map(a => a.trim()).filter(Boolean);
            continue;
          }

          // Code block handling
          if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
          }

          if (inCodeBlock) {
            codeLines.push(line);
          }
        }
      }

      // Parse coverage analysis
      if (section === 'coverage') {
        const coverageMatch = trimmed.match(/Estimated Coverage:\s*(\d+)/i);
        if (coverageMatch) {
          coverageAnalysis.estimatedCoverage = parseInt(coverageMatch[1] ?? '0', 10);
          continue;
        }

        if (trimmed.startsWith('- ') && trimmed.includes('Covered')) {
          // Skip header
          continue;
        } else if (trimmed.startsWith('- ') && trimmed.includes('Uncovered')) {
          // Skip header
          continue;
        } else if (trimmed.startsWith('- ')) {
          // Determine if this is covered or uncovered based on context
          const scenario = trimmed.substring(2).trim();
          // Simple heuristic: if we've seen "Uncovered Scenarios:" recently, it's uncovered
          if (content.indexOf('Uncovered Scenarios:') < content.indexOf(trimmed)) {
            coverageAnalysis.uncoveredScenarios.push(scenario);
          } else {
            coverageAnalysis.coveredScenarios.push(scenario);
          }
        }
      }

      // Parse recommendations
      if (section === 'recommendations' && trimmed.startsWith('- ')) {
        recommendations.push(trimmed.substring(2).trim());
      }
    }

    // Add last test if exists
    if (currentTest && codeLines.length > 0) {
      currentTest.code = codeLines.join('\n');
      testCases.push(currentTest as TestCase);
    }

    return { testCases, coverageAnalysis, recommendations };
  }

  /**
   * Generate metadata statistics
   */
  private generateMetadata(testCases: TestCase[]): TestGenerationResult['metadata'] {
    const testsByType: Record<string, number> = {};

    for (const test of testCases) {
      testsByType[test.type] = (testsByType[test.type] || 0) + 1;
    }

    return {
      totalTests: testCases.length,
      testsByType,
    };
  }

  /**
   * Get language identifier for framework
   */
  private getLanguageForFramework(framework: TestFramework): string {
    const languageMap: Record<TestFramework, string> = {
      'jest': 'typescript',
      'vitest': 'typescript',
      'mocha': 'typescript',
      'jasmine': 'typescript',
      'pytest': 'python',
      'junit': 'java',
      'bun:test': 'typescript',
      'custom': 'typescript',
    };

    return languageMap[framework] || 'typescript';
  }

  /**
   * Create a success result
   */
  private createTestSuccessResult(
    message: string,
    testCases: TestCase[],
    framework: TestFramework,
    coverageAnalysis: TestGenerationResult['coverageAnalysis'],
    recommendations: string[],
    metadata: TestGenerationResult['metadata']
  ): TestGenerationResult {
    return {
      success: true,
      message,
      output: this.formatTests(testCases, coverageAnalysis, recommendations),
      testCases,
      framework,
      coverageAnalysis,
      recommendations,
      metadata,
    };
  }

  /**
   * Create an error result
   */
  private createTestErrorResult(
    message: string,
    error: string
  ): TestGenerationResult {
    return {
      success: false,
      message,
      error,
      metadata: {
        totalTests: 0,
        testsByType: {},
      },
    };
  }

  /**
   * Format tests as readable output
   */
  private formatTests(
    testCases: TestCase[],
    coverageAnalysis: TestGenerationResult['coverageAnalysis'],
    recommendations: string[]
  ): string {
    const lines: string[] = [];

    lines.push('# Generated Tests');
    lines.push('');

    if (testCases.length > 0) {
      lines.push('## Test Cases');
      for (const test of testCases) {
        lines.push(`\n### ${test.name} [${test.type.toUpperCase()}]`);
        lines.push(test.description);
        lines.push('');
        lines.push('```typescript');
        lines.push(test.code);
        lines.push('```');
        if (test.assertions.length > 0) {
          lines.push(`Assertions: ${test.assertions.join(', ')}`);
        }
      }
      lines.push('');
    }

    if (coverageAnalysis) {
      lines.push('## Coverage Analysis');
      lines.push(`Estimated Coverage: ${coverageAnalysis.estimatedCoverage}%`);
      lines.push('');
      if (coverageAnalysis.coveredScenarios.length > 0) {
        lines.push('Covered Scenarios:');
        for (const scenario of coverageAnalysis.coveredScenarios) {
          lines.push(`- ${scenario}`);
        }
        lines.push('');
      }
      if (coverageAnalysis.uncoveredScenarios.length > 0) {
        lines.push('Uncovered Scenarios:');
        for (const scenario of coverageAnalysis.uncoveredScenarios) {
          lines.push(`- ${scenario}`);
        }
        lines.push('');
      }
    }

    if (recommendations.length > 0) {
      lines.push('## Recommendations');
      for (const rec of recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }
}
