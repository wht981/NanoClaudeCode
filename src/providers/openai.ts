/**
 * OpenAI provider implementation
 */

import OpenAI from 'openai';
import type {
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMCompletionOptions,
  LLMUsage,
  ToolCall,
} from '../types/llm.ts';
import {
  BaseProvider,
  type BaseProviderConfig,
  LLMError,
  RateLimitError,
  AuthenticationError,
  InvalidRequestError,
  ModelNotFoundError,
  ContextLengthExceededError,
} from './base.ts';

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends BaseProviderConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
}

/**
 * OpenAI model definitions
 */
const OPENAI_MODELS: LLMModel[] = [
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsFunctions: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsFunctions: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    supportsFunctions: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsFunctions: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsFunctions: true,
    supportsStreaming: true,
  },
];

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly supportedModels = OPENAI_MODELS;
  
  private readonly client: OpenAI;

  constructor(config: OpenAIConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new InvalidRequestError('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    });
  }

  /**
   * Non-streaming completion
   */
  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    this.validateOptions(options);

    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: options.model,
          messages: options.messages.map(msg => {
            const normalizedContent = typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content);
            if (msg.role === 'tool') {
              return {
                role: 'tool' as const,
                content: normalizedContent,
                tool_call_id: msg.toolCallId ?? '',
              };
            }
            if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
              return {
                role: 'assistant' as const,
                content: normalizedContent || null,
                tool_calls: msg.toolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                })),
              };
            }
            return {
              role: msg.role,
              content: normalizedContent,
              ...(msg.name && { name: msg.name }),
            };
          }),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stopSequences,
          tools: options.tools?.map(tool => ({
            type: 'function',
            function: {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            },
          })),
          tool_choice: this.convertToolChoice(options.toolChoice),
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new LLMError('No response from OpenAI', 'NO_RESPONSE');
        }

        const toolCalls = choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));

        return {
          content: choice.message.content ?? '',
          model: response.model,
          usage: this.convertUsage(response.usage),
          finishReason: this.convertFinishReason(choice.finish_reason),
          toolCalls,
        };
      } catch (error) {
        throw this.handleError(error);
      }
    });
  }

  /**
   * Streaming completion
   */
  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncIterable<LLMStreamChunk> {
    this.validateOptions(options);

    const stream = await this.executeWithRetry(async () => {
      try {
        return await this.client.chat.completions.create({
          model: options.model,
          messages: options.messages.map(msg => {
            const normalizedContent = typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content);
            if (msg.role === 'tool') {
              return {
                role: 'tool' as const,
                content: normalizedContent,
                tool_call_id: msg.toolCallId ?? '',
              };
            }
            if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
              return {
                role: 'assistant' as const,
                content: normalizedContent || null,
                tool_calls: msg.toolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                })),
              };
            }
            return {
              role: msg.role,
              content: normalizedContent,
              ...(msg.name && { name: msg.name }),
            };
          }),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stopSequences,
          tools: options.tools?.map(tool => ({
            type: 'function',
            function: {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            },
          })),
          tool_choice: this.convertToolChoice(options.toolChoice),
          stream: true,
        });
      } catch (error) {
        throw this.handleError(error);
      }
    });

    // Accumulate tool calls across chunks
    const toolCallsMap = new Map<number, ToolCall>();

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Handle tool calls
        const chunkToolCalls = choice.delta.tool_calls;
        let toolCalls: ToolCall[] | undefined;

        if (chunkToolCalls) {
          for (const tc of chunkToolCalls) {
            const index = tc.index;
            const existing = toolCallsMap.get(index);

            if (!existing) {
              // New tool call
              toolCallsMap.set(index, {
                id: tc.id ?? '',
                type: 'function',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              });
            } else {
              // Accumulate arguments
              if (tc.function?.name) {
                existing.function.name = tc.function.name;
              }
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments;
              }
            }
          }

          toolCalls = Array.from(toolCallsMap.values());
        }

        yield {
          content: choice.delta.content ?? '',
          model: chunk.model,
          finishReason: choice.finish_reason
            ? this.convertFinishReason(choice.finish_reason)
            : undefined,
          usage: chunk.usage ? this.convertUsage(chunk.usage) : undefined,
          toolCalls,
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }

  /**
   * Convert OpenAI usage to LLM usage
   */
  private convertUsage(usage: OpenAI.Completions.CompletionUsage | undefined): LLMUsage {
    return {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }

  /**
   * Convert OpenAI finish reason to LLM finish reason
   */
  private convertFinishReason(
    reason: string | null
  ): 'stop' | 'length' | 'content_filter' | 'tool_calls' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  /**
   * Convert tool choice to OpenAI format
   */
  private convertToolChoice(
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined {
    return toolChoice;
  }

  /**
   * Handle OpenAI errors and convert to LLM errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      const message = error.message;
      const statusCode = error.status;

      switch (statusCode) {
        case 401:
          return new AuthenticationError(message);
        case 429:
          // Extract retry-after header if available
          const retryAfter = error.headers?.['retry-after'];
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
          return new RateLimitError(message, retryAfterSeconds);
        case 400:
          // Check if it's a context length error
          if (message.toLowerCase().includes('context length') || 
              message.toLowerCase().includes('maximum context')) {
            return new ContextLengthExceededError(message);
          }
          return new InvalidRequestError(message);
        case 404:
          return new ModelNotFoundError(message);
        case 500:
        case 502:
        case 503:
        case 504:
          return new LLMError(message, 'SERVER_ERROR', statusCode);
        default:
          return new LLMError(message, 'API_ERROR', statusCode);
      }
    }

    if (error instanceof Error) {
      return new LLMError(error.message, 'UNKNOWN_ERROR', undefined, error);
    }

    return new LLMError(String(error), 'UNKNOWN_ERROR');
  }
}
