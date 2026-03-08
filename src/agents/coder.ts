import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  AgentResult,
} from '../types/agent';
import type { Message } from '../types/message';
import { BaseAgent } from './base';

/**
 * Programming language support
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'dart'
  | 'elixir'
  | 'haskell'
  | 'scala'
  | 'r'
  | 'shell'
  | 'sql'
  | 'html'
  | 'css'
  | 'yaml'
  | 'json'
  | 'markdown';

/**
 * Code generation task types
 */
export type CodeTaskType =
  | 'generate'     // Generate new code from scratch
  | 'refactor'     // Refactor existing code
  | 'fix'          // Fix bugs in code
  | 'test'         // Generate tests
  | 'document'     // Generate documentation
  | 'optimize'     // Optimize performance
  | 'review';      // Review code

/**
 * CoderAgent options
 */
export interface CoderAgentOptions {
  language?: ProgrammingLanguage;
  taskType?: CodeTaskType;
  maxIterations?: number;
  contextMessages?: Message[];
  followBestPractices?: boolean;
  includeComments?: boolean;
  strictTypeChecking?: boolean;
}

/**
 * Code generation result
 */
export interface CodeGenerationResult extends AgentResult {
  code?: string;
  language?: ProgrammingLanguage;
  taskType?: CodeTaskType;
  diagnostics?: CodeDiagnostic[];
}

/**
 * Code diagnostic information
 */
export interface CodeDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line?: number;
  column?: number;
  file?: string;
}

/**
 * CoderAgent specialized for code generation and modification tasks.
 * Supports multiple programming languages and various code-related tasks.
 */
export class CoderAgent extends BaseAgent {
  private readonly defaultLanguage: ProgrammingLanguage = 'typescript';
  private readonly supportedLanguages: Set<ProgrammingLanguage> = new Set([
    'typescript',
    'javascript',
    'python',
    'java',
    'csharp',
    'go',
    'rust',
    'cpp',
    'ruby',
    'php',
    'swift',
    'kotlin',
    'dart',
    'elixir',
    'haskell',
    'scala',
    'r',
    'shell',
    'sql',
    'html',
    'css',
    'yaml',
    'json',
    'markdown',
  ]);

  /**
   * Create a CoderAgent with specific configuration
   */
  static create(config?: Partial<AgentConfig>): CoderAgent {
    const defaultConfig: AgentConfig = {
      role: 'coder',
      name: 'CoderAgent',
      description: 'Specialized agent for code generation, refactoring, and bug fixes',
      systemPrompt: `You are an expert software engineer specializing in code generation, refactoring, and bug fixes.
Your responsibilities include:
- Writing clean, maintainable, and well-structured code
- Following language-specific best practices and conventions
- Providing comprehensive error handling and edge case coverage
- Writing clear documentation and comments
- Optimizing code for performance and readability
- Ensuring type safety and proper testing

When generating code:
1. Understand the requirements thoroughly
2. Choose appropriate data structures and algorithms
3. Follow SOLID principles and design patterns
4. Write self-documenting code with meaningful names
5. Include proper error handling and validation
6. Consider edge cases and potential issues
7. Add helpful comments for complex logic
8. Ensure code is testable and modular`,
      capabilities: {
        canExecuteTools: true,
        canStreamResponses: true,
        canAccessFiles: true,
        canAccessNetwork: false,
        canModifySystem: true,
        maxContextTokens: 16384,
      },
      llmProvider: 'openai',
      model: 'gpt-4',
      temperature: 0.2, // Lower temperature for more deterministic code generation
      maxTokens: 4096,
      tools: ['read_file', 'write_file', 'list_files', 'execute_command'],
    };

    return new CoderAgent({ ...defaultConfig, ...config });
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: ProgrammingLanguage): boolean {
    return this.supportedLanguages.has(language);
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): ProgrammingLanguage[] {
    return Array.from(this.supportedLanguages);
  }

  /**
   * Execute a code-related task
   */
  async execute(
    input: string,
    options?: CoderAgentOptions
  ): Promise<CodeGenerationResult> {
    this.ensureInitialized();
    this.setState('thinking');

    try {
      const language = options?.language ?? this.defaultLanguage;
      const taskType = options?.taskType ?? 'generate';

      if (!this.isLanguageSupported(language)) {
        this.setState('error');
        return this.createCodeErrorResult(
          'Unsupported language',
          `Language '${language}' is not supported. Supported languages: ${this.getSupportedLanguages().join(', ')}`,
          language,
          taskType
        );
      }

      // Build enhanced prompt with task context
      const enhancedPrompt = this.buildPrompt(input, language, taskType, options);

      // Prepare messages for LLM
      const messages = [
        {
          id: randomUUID(),
          role: 'system' as const,
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          id: randomUUID(),
          role: 'user' as const,
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      // Call LLM provider
      const response = await this.llmProvider!.complete({
        model: this.config.model,
        messages: messages as Message[],
        temperature: this.config.temperature ?? 0.2,
        maxTokens: this.config.maxTokens ?? 4096,
      });

      // Extract code from response
      const { code, diagnostics } = this.extractCode(response.content, language);

      this.setState('idle');

      return this.createCodeSuccessResult(
        'Code generation completed successfully',
        code,
        language,
        taskType,
        diagnostics
      );
    } catch (error) {
      this.setState('error');
      return this.createCodeErrorResult(
        'Code generation failed',
        error instanceof Error ? error.message : 'Unknown error',
        options?.language ?? this.defaultLanguage,
        options?.taskType ?? 'generate'
      );
    }
  }

  /**
   * Stream code generation
   */
  override async *executeStream(
    input: string,
    options?: CoderAgentOptions
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    this.ensureInitialized();
    this.setState('thinking');

    yield {
      type: 'thinking',
      content: 'Analyzing code generation task...',
    };

    const language = options?.language ?? this.defaultLanguage;
    const taskType = options?.taskType ?? 'generate';

    if (!this.isLanguageSupported(language)) {
      yield {
        type: 'output',
        content: `Error: Language '${language}' is not supported`,
      };
      this.setState('idle');
      return;
    }

    try {
      const enhancedPrompt = this.buildPrompt(input, language, taskType, options);

      const messages = [
        {
          id: randomUUID(),
          role: 'system' as const,
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          id: randomUUID(),
          role: 'user' as const,
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      let fullContent = '';

      // Stream from LLM provider
      for await (const chunk of this.llmProvider!.streamComplete({
        model: this.config.model,
        messages: messages as Message[],
        temperature: this.config.temperature ?? 0.2,
        maxTokens: this.config.maxTokens ?? 4096,
      })) {
        fullContent += chunk.content;

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
   * Build enhanced prompt with task context
   */
  private buildPrompt(
    input: string,
    language: ProgrammingLanguage,
    taskType: CodeTaskType,
    options?: CoderAgentOptions
  ): string {
    const parts: string[] = [];

    // Add task type context
    switch (taskType) {
      case 'generate':
        parts.push(`Generate ${language} code for the following requirement:`);
        break;
      case 'refactor':
        parts.push(`Refactor the following ${language} code to improve quality:`);
        break;
      case 'fix':
        parts.push(`Fix the bugs in the following ${language} code:`);
        break;
      case 'test':
        parts.push(`Generate comprehensive tests for the following ${language} code:`);
        break;
      case 'document':
        parts.push(`Generate documentation for the following ${language} code:`);
        break;
      case 'optimize':
        parts.push(`Optimize the following ${language} code for better performance:`);
        break;
      case 'review':
        parts.push(`Review the following ${language} code and provide feedback:`);
        break;
    }

    parts.push('');
    parts.push(input);
    parts.push('');

    // Add guidelines
    if (options?.followBestPractices !== false) {
      parts.push('Follow language-specific best practices and conventions.');
    }

    if (options?.includeComments !== false) {
      parts.push('Include helpful comments explaining the code logic.');
    }

    if (options?.strictTypeChecking && (language === 'typescript' || language === 'python')) {
      parts.push('Use strict type checking and type annotations.');
    }

    parts.push('');
    parts.push(`Respond with the ${language} code wrapped in markdown code blocks.`);

    return parts.join('\n');
  }

  /**
   * Extract code from LLM response
   */
  private extractCode(
    content: string,
    language: ProgrammingLanguage
  ): { code: string; diagnostics: CodeDiagnostic[] } {
    const diagnostics: CodeDiagnostic[] = [];

    // Try to extract code from markdown code blocks
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    if (matches.length === 0) {
      // No code blocks found, return entire content
      diagnostics.push({
        severity: 'warning',
        message: 'No markdown code blocks found in response',
      });
      return { code: content.trim(), diagnostics };
    }

    // Extract all code blocks and join them
    const code = matches.map((match) => (match[1] ?? '').trim()).join('\n\n');

    return { code, diagnostics };

  }

  /**
   * Create a success result with code
   */
  private createCodeSuccessResult(
    message: string,
    code: string,
    language: ProgrammingLanguage,
    taskType: CodeTaskType,
    diagnostics?: CodeDiagnostic[]
  ): CodeGenerationResult {
    return {
      success: true,
      message,
      output: code,
      code,
      language,
      taskType,
      diagnostics,
      metadata: {
        language,
        taskType,
        codeLength: code.length,
        linesOfCode: code.split('\n').length,
      },
    };
  }

  /**
   * Create an error result
   */
  private createCodeErrorResult(
    message: string,
    error: string,
    language: ProgrammingLanguage,
    taskType: CodeTaskType
  ): CodeGenerationResult {
    return {
      success: false,
      message,
      error,
      language,
      taskType,
      metadata: {
        language,
        taskType,
      },
    };
  }

  /**
   * Generate code for a specific task
   */
  async generateCode(
    requirements: string,
    language: ProgrammingLanguage,
    options?: Omit<CoderAgentOptions, 'language' | 'taskType'>
  ): Promise<CodeGenerationResult> {
    return this.execute(requirements, {
      ...options,
      language,
      taskType: 'generate',
    });
  }

  /**
   * Refactor existing code
   */
  async refactorCode(
    code: string,
    language: ProgrammingLanguage,
    options?: Omit<CoderAgentOptions, 'language' | 'taskType'>
  ): Promise<CodeGenerationResult> {
    return this.execute(code, {
      ...options,
      language,
      taskType: 'refactor',
    });
  }

  /**
   * Fix bugs in code
   */
  async fixCode(
    code: string,
    language: ProgrammingLanguage,
    bugDescription?: string,
    options?: Omit<CoderAgentOptions, 'language' | 'taskType'>
  ): Promise<CodeGenerationResult> {
    const input = bugDescription
      ? `${bugDescription}\n\n\`\`\`${language}\n${code}\n\`\`\``
      : code;

    return this.execute(input, {
      ...options,
      language,
      taskType: 'fix',
    });
  }

  /**
   * Generate tests for code
   */
  async generateTests(
    code: string,
    language: ProgrammingLanguage,
    testFramework?: string,
    options?: Omit<CoderAgentOptions, 'language' | 'taskType'>
  ): Promise<CodeGenerationResult> {
    const input = testFramework
      ? `Generate tests using ${testFramework}:\n\n\`\`\`${language}\n${code}\n\`\`\``
      : code;

    return this.execute(input, {
      ...options,
      language,
      taskType: 'test',
    });
  }

  /**
   * Review code and provide feedback
   */
  async reviewCode(
    code: string,
    language: ProgrammingLanguage,
    options?: Omit<CoderAgentOptions, 'language' | 'taskType'>
  ): Promise<CodeGenerationResult> {
    return this.execute(code, {
      ...options,
      language,
      taskType: 'review',
    });
  }
}
