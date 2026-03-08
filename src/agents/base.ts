import { randomUUID } from 'node:crypto';
import type {
  Agent,
  AgentCapabilities,
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentState,
} from '../types/agent';
import type { Message } from '../types/message';
import type { LLMProvider } from '../types/llm';
import type { Tool } from '../types/tool';

/**
 * Base implementation for all agents.
 */
export abstract class BaseAgent implements Agent {
  public readonly id: string;
  public readonly config: AgentConfig;

  protected llmProvider?: LLMProvider;
  protected readonly tools: Map<string, Tool> = new Map();
  protected context?: AgentContext;

  private currentState: AgentState = 'idle';

  constructor(config: AgentConfig, id: string = randomUUID()) {
    this.config = config;
    this.id = id;
  }

  get state(): AgentState {
    return this.currentState;
  }

  get capabilities(): AgentCapabilities {
    return this.config.capabilities;
  }

  async initialize(
    llmProvider: LLMProvider,
    tools: Tool[],
    context: AgentContext
  ): Promise<void> {
    if (this.currentState !== 'idle') {
      throw new Error(`Agent '${this.id}' cannot initialize from state '${this.currentState}'`);
    }

    this.setState('waiting');
    try {
      this.llmProvider = llmProvider;
      this.tools.clear();
      for (const tool of tools) {
        this.tools.set(tool.name, tool);
      }
      this.context = { ...context };

      await this.onInitialize();

      this.setState('idle');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  abstract execute(
    input: string,
    options?: {
      streaming?: boolean;
      maxIterations?: number;
      contextMessages?: Message[];
    }
  ): Promise<AgentResult>;

  async *executeStream(
    input: string,
    options?: {
      maxIterations?: number;
      contextMessages?: Message[];
    }
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    const result = await this.execute(input, {
      streaming: false,
      maxIterations: options?.maxIterations,
      contextMessages: options?.contextMessages,
    });

    if (!result.success) {
      throw new Error(result.error ?? result.message);
    }

    yield {
      type: 'output',
      content: result.output ?? result.message,
    };
  }

  async dispose(): Promise<void> {
    this.setState('waiting');
    try {
      await this.onDispose();
      this.llmProvider = undefined;
      this.tools.clear();
      this.context = undefined;
      this.setState('idle');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  getState(): AgentState {
    return this.currentState;
  }

  async reset(): Promise<void> {
    this.setState('waiting');
    try {
      await this.onReset();
      this.setState('idle');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  protected setState(state: AgentState): void {
    this.currentState = state;
  }

  protected ensureInitialized(): void {
    if (!this.llmProvider || !this.context) {
      throw new Error(`Agent '${this.id}' is not initialized`);
    }
  }

  protected getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  protected createSuccessResult(
    message: string,
    output?: string,
    metadata?: Record<string, unknown>
  ): AgentResult {
    return {
      success: true,
      message,
      output,
      metadata,
    };
  }

  protected createErrorResult(
    message: string,
    error: string,
    metadata?: Record<string, unknown>
  ): AgentResult {
    return {
      success: false,
      message,
      error,
      metadata,
    };
  }

  protected async onInitialize(): Promise<void> {
    // No-op by default. Subclasses can override.
  }

  protected async onDispose(): Promise<void> {
    // No-op by default. Subclasses can override.
  }

  protected async onReset(): Promise<void> {
    // No-op by default. Subclasses can override.
  }
}
