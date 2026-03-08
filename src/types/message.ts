/**
 * Message types for conversation history
 * Compatible with Anthropic and OpenAI message formats
 */

import type { ToolCall } from './llm';

/**
 * Message role types
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Message content types
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'url' | 'base64';
    url?: string;
    mediaType?: string;
    data?: string;
  };
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type MessageContent = 
  | string 
  | TextContent 
  | ImageContent 
  | ToolUseContent 
  | ToolResultContent;

/**
 * Message metadata
 */
export interface MessageMetadata {
  timestamp: number;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  executionTime?: number;
  [key: string]: unknown;
}

/**
 * Message interface
 */
export interface Message {
  id?: string;
  role: MessageRole;
  content: MessageContent | MessageContent[];
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  metadata?: MessageMetadata;
}

/**
 * Conversation thread
 */
export interface ConversationThread {
  id: string;
  messages: Message[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    title?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Message utilities
 */
export interface MessageFormatter {
  /**
   * Format message for LLM provider
   */
  formatForProvider(message: Message, provider: 'anthropic' | 'openai'): unknown;

  /**
   * Parse message from LLM provider response
   */
  parseFromProvider(response: unknown, provider: 'anthropic' | 'openai'): Message;

  /**
   * Convert message to string
   */
  toString(message: Message): string;
}
