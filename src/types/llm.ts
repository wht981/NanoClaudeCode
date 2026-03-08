/**
 * LLM Provider interfaces for streaming and non-streaming completions
 */

export interface LLMModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: LLMUsage;
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMStreamChunk {
  content: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  usage?: LLMUsage;
  toolCalls?: ToolCall[];
}

export interface LLMCompletionOptions {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: unknown;
    name?: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
  }>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface LLMProvider {
  readonly name: string;
  readonly supportedModels: LLMModel[];

  /**
   * Non-streaming completion
   */
  complete(options: LLMCompletionOptions): Promise<LLMResponse>;

  /**
   * Streaming completion
   */
  streamComplete(
    options: LLMCompletionOptions
  ): AsyncIterable<LLMStreamChunk>;

  /**
   * Get available models
   */
  getModels(): Promise<LLMModel[]>;
}
