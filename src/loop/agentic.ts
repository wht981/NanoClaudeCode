import type {
  LLMCompletionOptions,
  LLMProvider,
  LLMUsage,
  ToolCall,
} from '../types/llm.ts';
import type { Tool } from '../types/tool';
import { ToolExecutor, type ExecutionResult } from '../tools/executor';
import { HooksManager, type HookName, type HookPayload } from '../hooks/manager';
import type { ContextManager, ContextItem } from '../types/context';

type LoopMessage = LLMCompletionOptions['messages'][number];

export interface AgenticLoopConfig {
  provider: LLMProvider;
  executor: ToolExecutor;
  model: string;
  tools?: Tool[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  maxIterations?: number;
  maxConsecutiveErrors?: number;
  toolTimeoutMs?: number;
  validateToolArgs?: boolean;
  hooks?: HooksManager;
  contextManager?: ContextManager;
}

export interface RunAgenticLoopOptions {
  input: string;
  history?: LoopMessage[];
  maxIterations?: number;
}

export interface AgenticLoopResult {
  success: boolean;
  output: string;
  iterations: number;
  history: LoopMessage[];
  usage: LLMUsage;
  error?: string;
}

export type AgenticStreamEvent =
  | { type: 'reason'; content: string; iteration: number }
  | {
      type: 'act';
      iteration: number;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'observe';
      iteration: number;
      toolCallId: string;
      toolName: string;
      result: ExecutionResult;
    }
  | { type: 'error'; iteration: number; error: string }
  | { type: 'final'; result: AgenticLoopResult };

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 3;

function buildToolDefinitions(tools: Tool[]): NonNullable<LLMCompletionOptions['tools']> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  }));
}

function parseToolArguments(toolCall: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Tool arguments must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid tool call arguments for '${toolCall.function.name}': ${message}`);
  }
}

function normalizeHistory(history: LoopMessage[] | undefined): LoopMessage[] {
  if (!history || history.length === 0) {
    return [];
  }
  return history.map((message) => ({ ...message }));
}

function toolResultToMessage(result: ExecutionResult): string {
  if (result.success) {
    return result.output;
  }
  return `Tool '${result.toolName}' failed: ${result.error ?? 'Unknown error'}`;
}

function sumUsage(total: LLMUsage, next: LLMUsage): LLMUsage {
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

interface IterationResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: LLMUsage;
}

export class AgenticLoop {
  private readonly provider: LLMProvider;
  private readonly executor: ToolExecutor;
  private readonly systemMessages: LoopMessage[];
  private readonly baseOptions: Omit<LLMCompletionOptions, 'messages'>;
  private readonly maxIterations: number;
  private readonly maxConsecutiveErrors: number;
  private readonly toolTimeoutMs?: number;
  private readonly validateToolArgs: boolean;
  private readonly hooks?: HooksManager;
  private readonly contextManager?: ContextManager;

  constructor(config: AgenticLoopConfig) {
    this.provider = config.provider;
    this.executor = config.executor;
    this.hooks = config.hooks;
    this.contextManager = config.contextManager;
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveErrors = config.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
    this.toolTimeoutMs = config.toolTimeoutMs;
    this.validateToolArgs = config.validateToolArgs ?? true;

    const tools = config.tools ?? [];
    this.systemMessages = config.systemPrompt
      ? [{ role: 'system', content: config.systemPrompt }]
      : [];

    this.baseOptions = {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      tools: tools.length > 0 ? buildToolDefinitions(tools) : undefined,
      toolChoice: tools.length > 0 ? 'auto' : undefined,
    };
  }

  private async emitHook(name: HookName, payload: HookPayload): Promise<void> {
    if (!this.hooks) return;
    await this.hooks.emit(name, payload);
  }

  /**
   * Convert a LoopMessage to a ContextItem for tracking in the context manager.
   */
  private loopMessageToContextItem(msg: LoopMessage, index: number): ContextItem {
    const content = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
    const isSystem = msg.role === 'system';
    return {
      id: `msg-${index}-${Date.now()}`,
      type: isSystem ? 'system_prompt' : 'message',
      content,
      tokens: 0, // Will be calculated by context manager
      priority: isSystem ? 10 : (msg.role === 'user' ? 7 : 5),
      metadata: {
        source: 'loop',
        timestamp: Date.now(),
        role: msg.role,
        index,
      },
    };
  }

  /**
   * Sync history to context manager and prune if approaching token limits.
   * Modifies the history array in-place by removing pruned messages.
   */
  private async manageContext(history: LoopMessage[]): Promise<void> {
    if (!this.contextManager) return;

    // Clear and re-sync context manager with current history
    this.contextManager.clear();
    for (let i = 0; i < history.length; i++) {
      const item = this.loopMessageToContextItem(history[i]!, i);
      await this.contextManager.addItem(item);
    }

    // Check if pruning is needed
    const window = this.contextManager.getContextWindow();
    const availableTokens = window.maxTokens - window.reservedForCompletion;

    if (window.usedTokens > availableTokens * 0.9) {
      // Prune via context manager (removes lowest-priority items)
      const pruned = await this.contextManager.pruneContext(availableTokens);

      // Build set of pruned indices to remove from history
      const prunedIndices = new Set<number>();
      for (const item of pruned) {
        const index = item.metadata?.index;
        if (typeof index === 'number') {
          prunedIndices.add(index);
        }
      }

      // Remove pruned messages from history (iterate in reverse to preserve indices)
      if (prunedIndices.size > 0) {
        for (let i = history.length - 1; i >= 0; i--) {
          if (prunedIndices.has(i)) {
            history.splice(i, 1);
          }
        }
      }
    }
  }

  async run(options: RunAgenticLoopOptions): Promise<AgenticLoopResult> {
    return this.execute(options, false);
  }

  async *stream(options: RunAgenticLoopOptions): AsyncIterable<AgenticStreamEvent> {
    const history = [
      ...normalizeHistory(this.systemMessages),
      ...normalizeHistory(options.history),
      { role: 'user' as const, content: options.input },
    ];

    const maxIterations = options.maxIterations ?? this.maxIterations;
    let usage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let iteration = 0;
    let consecutiveErrors = 0;

    await this.emitHook('beforeLoop', { input: options.input, historyLength: history.length });

    while (iteration < maxIterations) {
      iteration += 1;

      // Manage context: sync history and prune if approaching token limits
      await this.manageContext(history);

      let llmResponse: IterationResponse;
      try {
        const stream = this.provider.streamComplete({
          ...this.baseOptions,
          messages: history,
        });

        let content = '';
        let streamUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        let toolCalls: ToolCall[] = [];

        for await (const chunk of stream) {
          if (chunk.content) {
            content += chunk.content;
            yield { type: 'reason', content: chunk.content, iteration };
          }
          if (chunk.usage) {
            streamUsage = chunk.usage;
          }
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            toolCalls = chunk.toolCalls;
          }
        }

        llmResponse = { content, toolCalls, usage: streamUsage };
        usage = sumUsage(usage, llmResponse.usage);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        consecutiveErrors += 1;
        await this.emitHook('onError', { error: message, iteration });
        yield { type: 'error', iteration, error: message };

        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          await this.emitHook('afterLoop', { result: { success: false, output: '', error: `Aborted after ${consecutiveErrors} consecutive errors: ${message}`, iterations: iteration, history, usage }, iterations: iteration });
          yield {
            type: 'final',
            result: {
              success: false,
              output: '',
              error: `Aborted after ${consecutiveErrors} consecutive errors: ${message}`,
              iterations: iteration,
              history,
              usage,
            },
          };
          return;
        }

        continue;
      }

      const assistantMessage: LoopMessage = {
        role: 'assistant',
        content: llmResponse.content,
        ...(llmResponse.toolCalls.length > 0 && { toolCalls: llmResponse.toolCalls }),
      };
      history.push(assistantMessage);

      if (llmResponse.toolCalls.length === 0) {
        const result = { success: true, output: llmResponse.content, iterations: iteration, history, usage };
        await this.emitHook('afterLoop', { result, iterations: iteration });
        yield {
          type: 'final',
          result: {
            success: true,
            output: llmResponse.content,
            iterations: iteration,
            history,
            usage,
          },
        };
        return;
      }

      let hadToolError = false;
      for (const toolCall of llmResponse.toolCalls) {
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = parseToolArguments(toolCall);
        } catch (error) {
          const parseError = error instanceof Error ? error.message : String(error);
          const result: ExecutionResult = {
            toolName: toolCall.function.name,
            success: false,
            output: '',
            error: parseError,
            duration: 0,
            validated: this.validateToolArgs,
          };

          history.push({
            role: 'tool',
            content: toolResultToMessage(result),
            toolCallId: toolCall.id,
            name: toolCall.function.name,
          });

          yield {
            type: 'observe',
            iteration,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            result,
          };

          hadToolError = true;
          continue;
        }

        yield {
          type: 'act',
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          args: parsedArgs,
        };

        await this.emitHook('beforeTool', { toolName: toolCall.function.name, args: parsedArgs, iteration });

        const result = await this.executor.execute(toolCall.function.name, parsedArgs, {
          timeout: this.toolTimeoutMs,
          validate: this.validateToolArgs,
        });

        await this.emitHook('afterTool', { toolName: toolCall.function.name, result, iteration });

        if (!result.success) {
          hadToolError = true;
        }

        history.push({
          role: 'tool',
          content: toolResultToMessage(result),
          toolCallId: toolCall.id,
          name: toolCall.function.name,
        });

        yield {
          type: 'observe',
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result,
        };
      }

      if (hadToolError) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          await this.emitHook('afterLoop', { result: { success: false, output: '', error: `Aborted after ${consecutiveErrors} consecutive tool failures`, iterations: iteration, history, usage }, iterations: iteration });
          yield {
            type: 'final',
            result: {
              success: false,
              output: '',
              error: `Aborted after ${consecutiveErrors} consecutive tool failures`,
              iterations: iteration,
              history,
              usage,
            },
          };
          return;
        }
      } else {
        consecutiveErrors = 0;
      }
    }

    const result = { success: false, output: '', error: `Reached max iterations (${maxIterations}) without a final response`, iterations: maxIterations, history, usage };
    await this.emitHook('afterLoop', { result, iterations: maxIterations });
    yield {
      type: 'final',
      result: {
        success: false,
        output: '',
        error: `Reached max iterations (${maxIterations}) without a final response`,
        iterations: maxIterations,
        history,
        usage,
      },
    };
  }

  private async execute(
    options: RunAgenticLoopOptions,
    streaming: boolean,
    onEvent?: (event: AgenticStreamEvent) => void
  ): Promise<AgenticLoopResult> {
    const history = [
      ...normalizeHistory(this.systemMessages),
      ...normalizeHistory(options.history),
      { role: 'user' as const, content: options.input },
    ];

    const maxIterations = options.maxIterations ?? this.maxIterations;
    const initialUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    let usage = initialUsage;
    let iteration = 0;
    let consecutiveErrors = 0;

    await this.emitHook('beforeLoop', { input: options.input, historyLength: history.length });

    while (iteration < maxIterations) {
      iteration += 1;

      // Manage context: sync history and prune if approaching token limits
      await this.manageContext(history);

      let llmResponse: IterationResponse;
      try {
        llmResponse = streaming
          ? await this.getStreamingResponse(history, iteration, onEvent)
          : await this.getResponse(history);
        usage = sumUsage(usage, llmResponse.usage);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        consecutiveErrors += 1;
        await this.emitHook('onError', { error: message, iteration });
        onEvent?.({ type: 'error', iteration, error: message });

        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          const errorMsg = `Aborted after ${consecutiveErrors} consecutive errors: ${message}`;
          const errorResult = { success: false, output: '', error: errorMsg, iterations: iteration, history, usage };
          await this.emitHook('afterLoop', { result: errorResult, iterations: iteration });
          return errorResult;
        }
        continue;
      }

      const assistantMessage: LoopMessage = {
        role: 'assistant',
        content: llmResponse.content,
        ...(llmResponse.toolCalls.length > 0 && { toolCalls: llmResponse.toolCalls }),
      };
      history.push(assistantMessage);

      if (llmResponse.toolCalls.length === 0) {
        const result = { success: true, output: llmResponse.content, iterations: iteration, history, usage };
        await this.emitHook('afterLoop', { result, iterations: iteration });
        return result;
      }

      let hadToolError = false;
      for (const toolCall of llmResponse.toolCalls) {
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = parseToolArguments(toolCall);
        } catch (error) {
          const parseError = error instanceof Error ? error.message : String(error);
          const result: ExecutionResult = {
            toolName: toolCall.function.name,
            success: false,
            output: '',
            error: parseError,
            duration: 0,
            validated: this.validateToolArgs,
          };

          history.push({
            role: 'tool',
            content: toolResultToMessage(result),
            toolCallId: toolCall.id,
            name: toolCall.function.name,
          });
          onEvent?.({
            type: 'observe',
            iteration,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            result,
          });
          hadToolError = true;
          continue;
        }

        onEvent?.({
          type: 'act',
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          args: parsedArgs,
        });

        await this.emitHook('beforeTool', { toolName: toolCall.function.name, args: parsedArgs, iteration });

        const result = await this.executor.execute(toolCall.function.name, parsedArgs, {
          timeout: this.toolTimeoutMs,
          validate: this.validateToolArgs,
        });

        await this.emitHook('afterTool', { toolName: toolCall.function.name, result, iteration });

        if (!result.success) {
          hadToolError = true;
        }

        history.push({
          role: 'tool',
          content: toolResultToMessage(result),
          toolCallId: toolCall.id,
          name: toolCall.function.name,
        });

        onEvent?.({
          type: 'observe',
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result,
        });
      }

      if (hadToolError) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          const errorMsg = `Aborted after ${consecutiveErrors} consecutive tool failures`;
          const errorResult = { success: false, output: '', error: errorMsg, iterations: iteration, history, usage };
          await this.emitHook('afterLoop', { result: errorResult, iterations: iteration });
          return errorResult;
        }
      } else {
        consecutiveErrors = 0;
      }
    }

    const result = { success: false, output: '', error: `Reached max iterations (${maxIterations}) without a final response`, iterations: maxIterations, history, usage };
    await this.emitHook('afterLoop', { result, iterations: maxIterations });
    return result;
  }

  private async getResponse(messages: LoopMessage[]): Promise<IterationResponse> {
    const response = await this.provider.complete({
      ...this.baseOptions,
      messages,
    });

    return {
      content: response.content,
      toolCalls: response.toolCalls ?? [],
      usage: response.usage,
    };
  }

  private async getStreamingResponse(
    messages: LoopMessage[],
    iteration: number,
    onEvent?: (event: AgenticStreamEvent) => void
  ): Promise<IterationResponse> {
    const stream = this.provider.streamComplete({
      ...this.baseOptions,
      messages,
    });

    let content = '';
    let usage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let toolCalls: ToolCall[] = [];

    for await (const chunk of stream) {
      if (chunk.content) {
        content += chunk.content;
        onEvent?.({ type: 'reason', content: chunk.content, iteration });
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.toolCalls && chunk.toolCalls.length > 0) {
        toolCalls = chunk.toolCalls;
      }
    }

    return {
      content,
      toolCalls,
      usage,
    };
  }
}

export function createAgenticLoop(config: AgenticLoopConfig): AgenticLoop {
  return new AgenticLoop(config);
}
