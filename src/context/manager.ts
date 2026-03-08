/**
 * Context manager implementation for handling conversation history and token limits
 */

import type {
  ContextItem,
  ContextItemType,
  ContextManager,
  ContextPruningStrategy,
  ContextWindow,
  TokenCounter,
} from '../types/context';
import type { Message } from '../types/message';

/**
 * Simple token counter implementation
 * Uses approximation: ~4 characters per token for English text
 */
export class SimpleTokenCounter implements TokenCounter {
  private readonly charsPerToken = 4;

  countTokens(text: string): number {
    if (!text) return 0;
    // Approximate token count based on character length
    // This is a simple heuristic - real implementation would use tiktoken
    return Math.ceil(text.length / this.charsPerToken);
  }

  countMessageTokens(messages: Message[]): number {
    let total = 0;
    
    for (const message of messages) {
      // Count role tokens
      total += this.countTokens(message.role);
      
      // Count content tokens
      if (typeof message.content === 'string') {
        total += this.countTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (typeof content === 'string') {
            total += this.countTokens(content);
          } else if ('text' in content) {
            total += this.countTokens(content.text);
          } else if ('content' in content) {
            total += this.countTokens(content.content);
          }
        }
      } else if ('text' in message.content) {
        total += this.countTokens(message.content.text);
      }
      
      // Count tool call tokens if present
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          total += this.countTokens(toolCall.function.name);
          total += this.countTokens(toolCall.function.arguments);
        }
      }
      
      // Add overhead for message formatting (~4 tokens per message)
      total += 4;
    }
    
    return total;
  }

  estimateCompletionTokens(prompt: string): number {
    // Estimate completion as ~50% of prompt length, with min/max bounds
    const promptTokens = this.countTokens(prompt);
    const estimate = Math.ceil(promptTokens * 0.5);
    return Math.max(100, Math.min(estimate, 2000));
  }
}

/**
 * In-memory context manager implementation
 */
export class InMemoryContextManager implements ContextManager {
  private items: Map<string, ContextItem> = new Map();
  private tokenCounter: TokenCounter;
  private maxTokens: number;
  private reservedForCompletion: number;

  constructor(
    maxTokens: number = 8000,
    reservedForCompletion: number = 2000,
    tokenCounter?: TokenCounter,
  ) {
    this.maxTokens = maxTokens;
    this.reservedForCompletion = reservedForCompletion;
    this.tokenCounter = tokenCounter || new SimpleTokenCounter();
  }

  async addItem(item: ContextItem): Promise<void> {
    // Validate item
    if (!item.id) {
      throw new Error('Context item must have an id');
    }
    
    // Count tokens if not provided
    if (item.tokens === 0 || !item.tokens) {
      item.tokens = this.tokenCounter.countTokens(item.content);
    }
    
    // Add item
    this.items.set(item.id, item);
    
    // Auto-prune if needed
    const currentTokens = this.getTotalTokens();
    const availableTokens = this.maxTokens - this.reservedForCompletion;
    
    if (currentTokens > availableTokens) {
      await this.pruneContext(availableTokens);
    }
  }

  async removeItem(itemId: string): Promise<boolean> {
    return this.items.delete(itemId);
  }

  getItems(): ContextItem[] {
    return Array.from(this.items.values());
  }

  getItemsByType(type: ContextItemType): ContextItem[] {
    return this.getItems().filter(item => item.type === type);
  }

  getTotalTokens(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.tokens;
    }
    return total;
  }

  getContextWindow(): ContextWindow {
    const usedTokens = this.getTotalTokens();
    const availableTokens = Math.max(0, this.maxTokens - usedTokens - this.reservedForCompletion);
    
    return {
      maxTokens: this.maxTokens,
      usedTokens,
      availableTokens,
      reservedForCompletion: this.reservedForCompletion,
    };
  }

  async pruneContext(
    maxTokens: number,
    strategy: ContextPruningStrategy = 'priority',
  ): Promise<ContextItem[]> {
    const removed: ContextItem[] = [];
    const currentTokens = this.getTotalTokens();
    
    if (currentTokens <= maxTokens) {
      return removed;
    }
    
    // Calculate how many tokens we need to free
    const tokensToRemove = currentTokens - maxTokens;
    let tokensFreed = 0;
    
    // Get items sorted by pruning strategy
    const sortedItems = this.sortItemsByStrategy(strategy);
    
    // Remove items until we're under the limit
    for (const item of sortedItems) {
      if (tokensFreed >= tokensToRemove) {
        break;
      }
      
      // Don't prune system prompts unless absolutely necessary
      if (item.type === 'system_prompt' && tokensFreed < tokensToRemove * 0.9) {
        continue;
      }
      
      removed.push(item);
      this.items.delete(item.id);
      tokensFreed += item.tokens;
    }
    
    return removed;
  }

  clear(): void {
    this.items.clear();
  }

  async optimize(): Promise<void> {
    // Group similar items
    const itemsByType = new Map<ContextItemType, ContextItem[]>();
    
    for (const item of this.items.values()) {
      const items = itemsByType.get(item.type) || [];
      items.push(item);
      itemsByType.set(item.type, items);
    }
    
    // Update relevance scores based on recency and type
    const now = Date.now();
    
    for (const item of this.items.values()) {
      const age = now - (item.metadata?.timestamp || now);
      const ageInMinutes = age / (1000 * 60);
      
      // Decay relevance over time
      let relevanceScore = 1.0;
      
      // System prompts and recent items stay relevant
      if (item.type === 'system_prompt') {
        relevanceScore = 1.0;
      } else if (ageInMinutes < 5) {
        relevanceScore = 1.0;
      } else if (ageInMinutes < 30) {
        relevanceScore = 0.8;
      } else if (ageInMinutes < 60) {
        relevanceScore = 0.5;
      } else {
        relevanceScore = 0.3;
      }
      
      // Update metadata
      if (!item.metadata) {
        item.metadata = {};
      }
      item.metadata.relevanceScore = relevanceScore;
    }
  }

  /**
   * Sort items based on pruning strategy
   */
  private sortItemsByStrategy(strategy: ContextPruningStrategy): ContextItem[] {
    const items = this.getItems();
    
    switch (strategy) {
      case 'fifo':
        // Remove oldest items first
        return items.sort((a, b) => {
          const aTime = a.metadata?.timestamp || 0;
          const bTime = b.metadata?.timestamp || 0;
          return aTime - bTime;
        });
        
      case 'lifo':
        // Remove newest items first
        return items.sort((a, b) => {
          const aTime = a.metadata?.timestamp || 0;
          const bTime = b.metadata?.timestamp || 0;
          return bTime - aTime;
        });
        
      case 'priority':
        // Remove lowest priority items first
        return items.sort((a, b) => a.priority - b.priority);
        
      case 'relevance':
        // Remove least relevant items first
        return items.sort((a, b) => {
          const aRelevance = a.metadata?.relevanceScore || 0;
          const bRelevance = b.metadata?.relevanceScore || 0;
          return aRelevance - bRelevance;
        });
        
      case 'token_size':
        // Remove largest items first
        return items.sort((a, b) => b.tokens - a.tokens);
        
      case 'hybrid':
        // Combination: consider priority, relevance, and age
        return items.sort((a, b) => {
          const aScore = this.calculateHybridScore(a);
          const bScore = this.calculateHybridScore(b);
          return aScore - bScore;
        });
        
      default:
        return items;
    }
  }

  /**
   * Calculate hybrid score for pruning
   * Lower score = more likely to be pruned
   */
  private calculateHybridScore(item: ContextItem): number {
    const priorityWeight = 0.4;
    const relevanceWeight = 0.4;
    const ageWeight = 0.2;
    
    // Normalize priority (0-1 scale, assuming priority range 0-10)
    const normalizedPriority = Math.min(item.priority / 10, 1);
    
    // Get relevance score
    const relevance = item.metadata?.relevanceScore || 0.5;
    
    // Calculate age score (newer = higher score)
    const now = Date.now();
    const timestamp = item.metadata?.timestamp || now;
    const ageInMinutes = (now - timestamp) / (1000 * 60);
    const ageScore = Math.max(0, 1 - (ageInMinutes / 120)); // Decay over 2 hours
    
    // Calculate weighted score
    const score =
      normalizedPriority * priorityWeight +
      relevance * relevanceWeight +
      ageScore * ageWeight;
    
    return score;
  }

  /**
   * Set maximum token limit
   */
  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  /**
   * Set reserved tokens for completion
   */
  setReservedForCompletion(reserved: number): void {
    this.reservedForCompletion = reserved;
  }

  /**
   * Get token counter instance
   */
  getTokenCounter(): TokenCounter {
    return this.tokenCounter;
  }
}

/**
 * Create a context item from a message
 */
export function createContextItemFromMessage(
  message: Message,
  priority: number = 5,
): ContextItem {
  const content = typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
    ? message.content.map(c => 
        typeof c === 'string' 
          ? c 
          : 'text' in c 
          ? c.text 
          : 'content' in c 
          ? c.content 
          : ''
      ).join('\n')
    : 'text' in message.content
    ? message.content.text
    : '';

  return {
    id: message.id ?? `msg-${Date.now()}`,
    type: 'message',
    content,
    tokens: 0, // Will be calculated by manager
    priority,
    metadata: {
      source: 'message',
      timestamp: message.metadata?.timestamp || Date.now(),
      role: message.role,
    },
  };
}

/**
 * Create a context item from file content
 */
export function createContextItemFromFile(
  id: string,
  filePath: string,
  content: string,
  priority: number = 5,
): ContextItem {
  return {
    id,
    type: 'file',
    content,
    tokens: 0,
    priority,
    metadata: {
      source: filePath,
      timestamp: Date.now(),
    },
  };
}

/**
 * Create a context item for system prompt
 */
export function createSystemPromptItem(
  id: string,
  prompt: string,
  priority: number = 10,
): ContextItem {
  return {
    id,
    type: 'system_prompt',
    content: prompt,
    tokens: 0,
    priority, // System prompts have highest priority
    metadata: {
      source: 'system',
      timestamp: Date.now(),
    },
  };
}
