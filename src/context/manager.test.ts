/**
 * Unit tests for context manager
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  InMemoryContextManager,
  SimpleTokenCounter,
  createContextItemFromMessage,
  createContextItemFromFile,
  createSystemPromptItem,
} from './manager';
import type { ContextItem, ContextPruningStrategy } from '../types/context';
import type { Message } from '../types/message';

describe('SimpleTokenCounter', () => {
  const counter = new SimpleTokenCounter();

  test('counts tokens in simple text', () => {
    const text = 'Hello world';
    const tokens = counter.countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(text.length / 4));
  });

  test('handles empty text', () => {
    expect(counter.countTokens('')).toBe(0);
  });

  test('counts tokens in messages', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'user',
        content: 'Hello',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Hi there!',
      },
    ];

    const tokens = counter.countMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  test('counts tokens in messages with array content', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      },
    ];

    const tokens = counter.countMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  test('counts tokens in messages with tool calls', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'Using tool',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search',
              arguments: JSON.stringify({ query: 'test' }),
            },
          },
        ],
      },
    ];

    const tokens = counter.countMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  test('estimates completion tokens', () => {
    const prompt = 'Write a short story about a cat';
    const estimate = counter.estimateCompletionTokens(prompt);
    expect(estimate).toBeGreaterThanOrEqual(100);
    expect(estimate).toBeLessThanOrEqual(2000);
  });
});

describe('InMemoryContextManager', () => {
  let manager: InMemoryContextManager;

  beforeEach(() => {
    manager = new InMemoryContextManager(8000, 2000);
  });

  describe('addItem', () => {
    test('adds item to context', async () => {
      const item: ContextItem = {
        id: '1',
        type: 'message',
        content: 'Test message',
        tokens: 10,
        priority: 5,
      };

      await manager.addItem(item);
      const items = manager.getItems();
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(item);
    });

    test('calculates tokens if not provided', async () => {
      const item: ContextItem = {
        id: '1',
        type: 'message',
        content: 'Test message',
        tokens: 0,
        priority: 5,
      };

      await manager.addItem(item);
      const items = manager.getItems();
      expect(items[0]!.tokens).toBeGreaterThan(0);
    });

    test('throws error if item has no id', async () => {
      const item = {
        type: 'message',
        content: 'Test',
        tokens: 10,
        priority: 5,
      } as ContextItem;

      await expect(manager.addItem(item)).rejects.toThrow('Context item must have an id');
    });

    test('auto-prunes when exceeding limit', async () => {
      // Create manager with small limit
      const smallManager = new InMemoryContextManager(100, 20);

      // Add items that exceed limit
      for (let i = 0; i < 10; i++) {
        await smallManager.addItem({
          id: `item-${i}`,
          type: 'message',
          content: 'x'.repeat(50), // ~12 tokens each
          tokens: 0,
          priority: i,
        });
      }

      // Should have pruned some items
      const totalTokens = smallManager.getTotalTokens();
      expect(totalTokens).toBeLessThanOrEqual(100 - 20);
    });
  });

  describe('removeItem', () => {
    test('removes item from context', async () => {
      const item: ContextItem = {
        id: '1',
        type: 'message',
        content: 'Test',
        tokens: 10,
        priority: 5,
      };

      await manager.addItem(item);
      const removed = await manager.removeItem('1');
      expect(removed).toBe(true);
      expect(manager.getItems()).toHaveLength(0);
    });

    test('returns false for non-existent item', async () => {
      const removed = await manager.removeItem('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getItems', () => {
    test('returns all items', async () => {
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Test 1',
        tokens: 10,
        priority: 5,
      });
      await manager.addItem({
        id: '2',
        type: 'file',
        content: 'Test 2',
        tokens: 10,
        priority: 5,
      });

      const items = manager.getItems();
      expect(items).toHaveLength(2);
    });

    test('returns empty array when no items', () => {
      expect(manager.getItems()).toHaveLength(0);
    });
  });

  describe('getItemsByType', () => {
    beforeEach(async () => {
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Message',
        tokens: 10,
        priority: 5,
      });
      await manager.addItem({
        id: '2',
        type: 'file',
        content: 'File',
        tokens: 10,
        priority: 5,
      });
      await manager.addItem({
        id: '3',
        type: 'message',
        content: 'Another message',
        tokens: 10,
        priority: 5,
      });
    });

    test('returns items of specific type', () => {
      const messages = manager.getItemsByType('message');
      expect(messages).toHaveLength(2);
      expect(messages.every(item => item.type === 'message')).toBe(true);
    });

    test('returns empty array for non-existent type', () => {
      const items = manager.getItemsByType('documentation');
      expect(items).toHaveLength(0);
    });
  });

  describe('getTotalTokens', () => {
    test('calculates total tokens correctly', async () => {
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Test',
        tokens: 10,
        priority: 5,
      });
      await manager.addItem({
        id: '2',
        type: 'message',
        content: 'Test',
        tokens: 20,
        priority: 5,
      });

      expect(manager.getTotalTokens()).toBe(30);
    });

    test('returns 0 when no items', () => {
      expect(manager.getTotalTokens()).toBe(0);
    });
  });

  describe('getContextWindow', () => {
    test('returns correct context window info', async () => {
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Test',
        tokens: 100,
        priority: 5,
      });

      const window = manager.getContextWindow();
      expect(window.maxTokens).toBe(8000);
      expect(window.usedTokens).toBe(100);
      expect(window.reservedForCompletion).toBe(2000);
      expect(window.availableTokens).toBe(8000 - 100 - 2000);
    });

    test('handles negative available tokens', async () => {
      // Add items exceeding limit
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Test',
        tokens: 7000,
        priority: 5,
      });

      const window = manager.getContextWindow();
      expect(window.availableTokens).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pruneContext', () => {
    beforeEach(async () => {
      // Add items with different priorities and timestamps
      for (let i = 0; i < 5; i++) {
        await manager.addItem({
          id: `item-${i}`,
          type: 'message',
          content: 'x'.repeat(20),
          tokens: 10 * (i + 1), // 10, 20, 30, 40, 50
          priority: i,
          metadata: {
            timestamp: Date.now() - (i * 1000),
          },
        });
      }
    });

    test('prunes with fifo strategy', async () => {
      const removed = await manager.pruneContext(100, 'fifo');
      expect(removed.length).toBeGreaterThan(0);
      expect(manager.getTotalTokens()).toBeLessThanOrEqual(100);
    });

    test('prunes with lifo strategy', async () => {
      const removed = await manager.pruneContext(100, 'lifo');
      expect(removed.length).toBeGreaterThan(0);
      expect(manager.getTotalTokens()).toBeLessThanOrEqual(100);
    });

    test('prunes with priority strategy', async () => {
      const removed = await manager.pruneContext(100, 'priority');
      expect(removed.length).toBeGreaterThan(0);
      // Should remove lowest priority items first
      expect(removed[0]!.priority).toBeLessThanOrEqual(removed[removed.length - 1]!.priority);
    });

    test('prunes with token_size strategy', async () => {
      const removed = await manager.pruneContext(100, 'token_size');
      expect(removed.length).toBeGreaterThan(0);
      expect(manager.getTotalTokens()).toBeLessThanOrEqual(100);
    });

    test('prunes with hybrid strategy', async () => {
      const removed = await manager.pruneContext(100, 'hybrid');
      expect(removed.length).toBeGreaterThan(0);
      expect(manager.getTotalTokens()).toBeLessThanOrEqual(100);
    });

    test('does not prune when under limit', async () => {
      const removed = await manager.pruneContext(200, 'priority');
      expect(removed).toHaveLength(0);
    });

    test('preserves system prompts when possible', async () => {
      await manager.addItem({
        id: 'system',
        type: 'system_prompt',
        content: 'System prompt',
        tokens: 20,
        priority: 10,
      });

      await manager.pruneContext(100, 'priority');
      const items = manager.getItems();
      const hasSystemPrompt = items.some(item => item.type === 'system_prompt');
      expect(hasSystemPrompt).toBe(true);
    });
  });

  describe('clear', () => {
    test('removes all items', async () => {
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Test',
        tokens: 10,
        priority: 5,
      });
      await manager.addItem({
        id: '2',
        type: 'message',
        content: 'Test',
        tokens: 10,
        priority: 5,
      });

      manager.clear();
      expect(manager.getItems()).toHaveLength(0);
      expect(manager.getTotalTokens()).toBe(0);
    });
  });

  describe('optimize', () => {
    test('updates relevance scores based on age', async () => {
      const now = Date.now();
      
      // Add old item
      await manager.addItem({
        id: '1',
        type: 'message',
        content: 'Old message',
        tokens: 10,
        priority: 5,
        metadata: {
          timestamp: now - (120 * 60 * 1000), // 2 hours ago
        },
      });

      // Add recent item
      await manager.addItem({
        id: '2',
        type: 'message',
        content: 'Recent message',
        tokens: 10,
        priority: 5,
        metadata: {
          timestamp: now - (1 * 60 * 1000), // 1 minute ago
        },
      });

      await manager.optimize();

      const items = manager.getItems();
      const oldItem = items.find(item => item.id === '1');
      const recentItem = items.find(item => item.id === '2');

      expect(oldItem!.metadata?.relevanceScore).toBeLessThan(
        recentItem!.metadata?.relevanceScore || 0
      );
    });

    test('maintains system prompt relevance', async () => {
      await manager.addItem({
        id: 'system',
        type: 'system_prompt',
        content: 'System prompt',
        tokens: 10,
        priority: 10,
        metadata: {
          timestamp: Date.now() - (120 * 60 * 1000), // 2 hours ago
        },
      });

      await manager.optimize();

      const items = manager.getItems();
      const systemItem = items.find(item => item.type === 'system_prompt');
      expect(systemItem?.metadata?.relevanceScore).toBe(1.0);
    });
  });

  describe('configuration', () => {
    test('sets max tokens', () => {
      manager.setMaxTokens(10000);
      const window = manager.getContextWindow();
      expect(window.maxTokens).toBe(10000);
    });

    test('sets reserved for completion', () => {
      manager.setReservedForCompletion(3000);
      const window = manager.getContextWindow();
      expect(window.reservedForCompletion).toBe(3000);
    });

    test('gets token counter', () => {
      const counter = manager.getTokenCounter();
      expect(counter).toBeDefined();
      expect(counter.countTokens('test')).toBeGreaterThan(0);
    });
  });
});

describe('Helper functions', () => {
  describe('createContextItemFromMessage', () => {
    test('creates item from simple message', () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Hello world',
      };

      const item = createContextItemFromMessage(message);
      expect(item.id).toBe('1');
      expect(item.type).toBe('message');
      expect(item.content).toBe('Hello world');
      expect(item.priority).toBe(5);
    });

    test('creates item from message with array content', () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      };

      const item = createContextItemFromMessage(message);
      expect(item.content).toContain('Hello');
      expect(item.content).toContain('World');
    });

    test('uses custom priority', () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Test',
      };

      const item = createContextItemFromMessage(message, 8);
      expect(item.priority).toBe(8);
    });
  });

  describe('createContextItemFromFile', () => {
    test('creates item from file', () => {
      const item = createContextItemFromFile(
        'file-1',
        '/path/to/file.ts',
        'const x = 1;',
        7
      );

      expect(item.id).toBe('file-1');
      expect(item.type).toBe('file');
      expect(item.content).toBe('const x = 1;');
      expect(item.priority).toBe(7);
      expect(item.metadata?.source).toBe('/path/to/file.ts');
    });
  });

  describe('createSystemPromptItem', () => {
    test('creates system prompt item', () => {
      const item = createSystemPromptItem(
        'system-1',
        'You are a helpful assistant'
      );

      expect(item.id).toBe('system-1');
      expect(item.type).toBe('system_prompt');
      expect(item.content).toBe('You are a helpful assistant');
      expect(item.priority).toBe(10);
    });

    test('uses custom priority', () => {
      const item = createSystemPromptItem(
        'system-1',
        'You are a helpful assistant',
        9
      );

      expect(item.priority).toBe(9);
    });
  });
});
