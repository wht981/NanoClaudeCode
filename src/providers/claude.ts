/**
 * Anthropic Claude provider implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMCompletionOptions,
  ToolCall,
} from '../types/llm.ts';
import {
  BaseProvider,
  type BaseProviderConfig,
  LLMError,
  AuthenticationError,
  InvalidRequestError,
  RateLimitError,
  ModelNotFoundError,
  ContextLengthExceededError,
} from './base.ts';

/**
 * Configuration for Claude provider
 */
export interface ClaudeProviderConfig extends BaseProviderConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Claude provider implementation using @anthropic-ai/sdk
 */
export class ClaudeProvider extends BaseProvider implements LLMProvider {
  readonly name = 'claude';
  readonly supportedModels: LLMModel[] = [
    {
      id: 'claude-3-5-sonnet-20240620',
      name: 'Claude 3.5 Sonnet',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      supportsFunctions: true,
      supportsStreaming: true,
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      supportsFunctions: true,
      supportsStreaming: true,
    },
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      supportsFunctions: true,
      supportsStreaming: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      supportsFunctions: true,
      supportsStreaming: true,
    },
  ];

  private readonly client: Anthropic;

  constructor(config: ClaudeProviderConfig = {}) {
    super(config);
    
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AuthenticationError('Claude API key is required');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseURL,
      timeout: this.timeout,
    });
  }

  /**
   * Non-streaming completion
   */
  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    this.validateOptions(options);

    return this.executeWithRetry(async () => {
      try {
        // Separate system messages from conversation messages
        const systemMessages = options.messages.filter(m => m.role === 'system');
        const conversationMessages = options.messages.filter(m => m.role !== 'system');

        // Build system prompt from system messages
        const system = systemMessages.length > 0
          ? systemMessages.map(m => m.content).join('\n\n')
          : undefined;

        // Convert messages to Anthropic format
        const messages = conversationMessages.map(msg => {
          const normalizedContent = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
          // Handle tool results
          if (msg.role === 'tool') {
            return {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: msg.toolCallId!,
                  content: normalizedContent,
                },
              ],
            };
          }

          // Handle assistant messages with tool calls
          if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }> = [];
            if (normalizedContent) {
              contentBlocks.push({ type: 'text' as const, text: normalizedContent });
            }
            for (const tc of msg.toolCalls) {
              let parsedInput: unknown;
              try {
                parsedInput = JSON.parse(tc.function.arguments);
              } catch {
                parsedInput = {};
              }
              contentBlocks.push({
                type: 'tool_use' as const,
                id: tc.id,
                name: tc.function.name,
                input: parsedInput,
              });
            }
            return {
              role: 'assistant' as const,
              content: contentBlocks,
            };
          }

          return {
            role: msg.role as 'user' | 'assistant',
            content: normalizedContent,
          };
        });

        // Build tools array if provided
        const tools = options.tools?.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: {
            type: 'object' as const,
            properties: (tool.function.parameters as any).properties ?? {},
            required: (tool.function.parameters as any).required,
          },
        }));

        // Build tool choice
        let tool_choice: Anthropic.Messages.MessageCreateParams['tool_choice'];
        if (options.toolChoice) {
          if (options.toolChoice === 'auto') {
            tool_choice = { type: 'auto' };
          } else if (options.toolChoice === 'none') {
            tool_choice = { type: 'any' }; // Claude uses 'any' instead of 'none'
          } else if (typeof options.toolChoice === 'object') {
            tool_choice = {
              type: 'tool',
              name: options.toolChoice.function.name,
            };
          }
        }

        const response = await this.client.messages.create({
          model: options.model,
          messages,
          system,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature,
          top_p: options.topP,
          stop_sequences: options.stopSequences,
          tools,
          tool_choice,
        });

        // Extract content and tool calls
        let content = '';
        const toolCalls: ToolCall[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }

        // Determine finish reason
        let finishReason: LLMResponse['finishReason'];
        switch (response.stop_reason) {
          case 'end_turn':
            finishReason = 'stop';
            break;
          case 'max_tokens':
            finishReason = 'length';
            break;
          case 'stop_sequence':
            finishReason = 'stop';
            break;
          case 'tool_use':
            finishReason = 'tool_calls';
            break;
          default:
            finishReason = 'stop';
        }

        return {
          content,
          model: response.model,
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
          finishReason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
      } catch (error) {
        throw this.mapError(error);
      }
    });
  }

  /**
   * Streaming completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterable<LLMStreamChunk> {
    this.validateOptions(options);

    // Separate system messages from conversation messages
    const systemMessages = options.messages.filter(m => m.role === 'system');
    const conversationMessages = options.messages.filter(m => m.role !== 'system');

    // Build system prompt from system messages
    const system = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : undefined;

    // Convert messages to Anthropic format
        const messages = conversationMessages.map(msg => {
          const normalizedContent = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
          // Handle tool results
          if (msg.role === 'tool') {
            return {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: msg.toolCallId!,
                  content: normalizedContent,
                },
              ],
            };
          }

          // Handle assistant messages with tool calls
          if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }> = [];
            if (normalizedContent) {
              contentBlocks.push({ type: 'text' as const, text: normalizedContent });
            }
            for (const tc of msg.toolCalls) {
              let parsedInput: unknown;
              try {
                parsedInput = JSON.parse(tc.function.arguments);
              } catch {
                parsedInput = {};
              }
              contentBlocks.push({
                type: 'tool_use' as const,
                id: tc.id,
                name: tc.function.name,
                input: parsedInput,
              });
            }
            return {
              role: 'assistant' as const,
              content: contentBlocks,
            };
          }

          return {
            role: msg.role as 'user' | 'assistant',
            content: normalizedContent,
          };
        });

    // Build tools array if provided
    const tools = options.tools?.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object' as const,
        properties: (tool.function.parameters as any).properties ?? {},
        required: (tool.function.parameters as any).required,
      },
    }));

    // Build tool choice
    let tool_choice: Anthropic.Messages.MessageCreateParams['tool_choice'];
    if (options.toolChoice) {
      if (options.toolChoice === 'auto') {
        tool_choice = { type: 'auto' };
      } else if (options.toolChoice === 'none') {
        tool_choice = { type: 'any' };
      } else if (typeof options.toolChoice === 'object') {
        tool_choice = {
          type: 'tool',
          name: options.toolChoice.function.name,
        };
      }
    }

    try {
      const stream = await this.client.messages.create({
        model: options.model,
        messages,
        system,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: options.stopSequences,
        tools,
        tool_choice,
        stream: true,
      });

      let currentModel = '';
      let currentToolCalls: ToolCall[] = [];
      const toolCallsInProgress = new Map<number, { id: string; name: string; input: string }>();

      for await (const event of stream) {
        if (event.type === 'message_start') {
          currentModel = event.message.model;
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolCallsInProgress.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              content: event.delta.text,
              model: currentModel,
            };
          } else if (event.delta.type === 'input_json_delta') {
            const toolCall = toolCallsInProgress.get(event.index);
            if (toolCall) {
              toolCall.input += event.delta.partial_json;
            }
          }
        } else if (event.type === 'content_block_stop') {
          const toolCall = toolCallsInProgress.get(event.index);
          if (toolCall) {
            currentToolCalls.push({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: toolCall.input,
              },
            });
            toolCallsInProgress.delete(event.index);
          }
        } else if (event.type === 'message_delta') {
          // Map finish reason
          let finishReason: LLMStreamChunk['finishReason'];
          if (event.delta.stop_reason) {
            switch (event.delta.stop_reason) {
              case 'end_turn':
                finishReason = 'stop';
                break;
              case 'max_tokens':
                finishReason = 'length';
                break;
              case 'stop_sequence':
                finishReason = 'stop';
                break;
              case 'tool_use':
                finishReason = 'tool_calls';
                break;
            }
          }

          yield {
            content: '',
            model: currentModel,
            finishReason,
            usage: {
              promptTokens: 0, // Not available in delta
              completionTokens: event.usage.output_tokens,
              totalTokens: event.usage.output_tokens,
            },
            toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
          };
        }
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }

  /**
   * Map Anthropic SDK errors to our error types
   */
  private mapError(error: unknown): LLMError {
    if (error instanceof Anthropic.APIError) {
      const statusCode = error.status;
      const message = error.message;

      // Authentication errors
      if (statusCode === 401) {
        return new AuthenticationError(message);
      }

      // Rate limit errors
      if (statusCode === 429) {
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'], 10)
          : undefined;
        return new RateLimitError(message, retryAfter);
      }

      // Invalid request errors
      if (statusCode === 400) {
        if (message.includes('context_length_exceeded') || message.includes('prompt is too long')) {
          return new ContextLengthExceededError(message);
        }
        return new InvalidRequestError(message);
      }

      // Model not found errors
      if (statusCode === 404) {
        return new ModelNotFoundError(message);
      }

      // Generic LLM error for other cases
      return new LLMError(message, 'API_ERROR', statusCode, error);
    }

    // Unknown error
    if (error instanceof Error) {
      return new LLMError(error.message, 'UNKNOWN_ERROR', undefined, error);
    }

    return new LLMError(String(error), 'UNKNOWN_ERROR');
  }
}
