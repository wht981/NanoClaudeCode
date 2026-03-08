/**
 * Context types for token management and context window handling
 */

import type { Message } from './message';

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Context window information
 */
export interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  availableTokens: number;
  reservedForCompletion: number;
}

/**
 * Context item types
 */
export type ContextItemType = 
  | 'message'
  | 'file'
  | 'directory'
  | 'code_snippet'
  | 'documentation'
  | 'system_prompt'
  | 'tool_result';

/**
 * Context item
 */
export interface ContextItem {
  id: string;
  type: ContextItemType;
  content: string;
  tokens: number;
  priority: number; // Higher priority = less likely to be pruned
  metadata?: {
    source?: string;
    timestamp?: number;
    relevanceScore?: number;
    [key: string]: unknown;
  };
}

/**
 * Context pruning strategy
 */
export type ContextPruningStrategy = 
  | 'fifo'           // First in, first out
  | 'lifo'           // Last in, first out
  | 'priority'       // Based on priority scores
  | 'relevance'      // Based on relevance scores
  | 'token_size'     // Remove largest items first
  | 'hybrid';        // Combination of strategies

/**
 * Context manager interface
 */
export interface ContextManager {
  /**
   * Add item to context
   */
  addItem(item: ContextItem): Promise<void>;

  /**
   * Remove item from context
   */
  removeItem(itemId: string): Promise<boolean>;

  /**
   * Get all context items
   */
  getItems(): ContextItem[];

  /**
   * Get context items by type
   */
  getItemsByType(type: ContextItemType): ContextItem[];

  /**
   * Calculate total tokens
   */
  getTotalTokens(): number;

  /**
   * Get context window information
   */
  getContextWindow(): ContextWindow;

  /**
   * Prune context to fit within token limit
   */
  pruneContext(maxTokens: number, strategy?: ContextPruningStrategy): Promise<ContextItem[]>;

  /**
   * Clear all context
   */
  clear(): void;

  /**
   * Optimize context for better relevance
   */
  optimize(): Promise<void>;
}

/**
 * Token counter interface
 */
export interface TokenCounter {
  /**
   * Count tokens in text
   */
  countTokens(text: string): number;

  /**
   * Count tokens in messages
   */
  countMessageTokens(messages: Message[]): number;

  /**
   * Estimate tokens for completion
   */
  estimateCompletionTokens(prompt: string): number;
}

/**
 * Context builder for constructing context from various sources
 */
export interface ContextBuilder {
  /**
   * Add messages to context
   */
  addMessages(messages: Message[]): ContextBuilder;

  /**
   * Add file content to context
   */
  addFile(filePath: string, priority?: number): Promise<ContextBuilder>;

  /**
   * Add directory content to context
   */
  addDirectory(dirPath: string, options?: {
    recursive?: boolean;
    exclude?: string[];
    maxFiles?: number;
  }): Promise<ContextBuilder>;

  /**
   * Add code snippet to context
   */
  addCodeSnippet(code: string, language: string, metadata?: Record<string, unknown>): ContextBuilder;

  /**
   * Add system prompt to context
   */
  addSystemPrompt(prompt: string): ContextBuilder;

  /**
   * Build final context
   */
  build(): Promise<ContextItem[]>;

  /**
   * Reset builder
   */
  reset(): void;
}
