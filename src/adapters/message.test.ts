/**
 * Tests for message adapter layer
 * Covers round-trip conversions and edge cases
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  loopMessageToMessage,
  messageToLoopMessage,
  type LoopMessage,
} from './message';
import type { Message } from '../types/message';
import type { ToolCall } from '../types/llm';

describe('Message Adapter', () => {
  describe('loopMessageToMessage', () => {
    it('converts a user message (string content)', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: 'Hello, world!',
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello, world!');
      expect(msg.id).toBeDefined();
      expect(msg.metadata).toBeDefined();
      expect(msg.metadata?.timestamp).toBeDefined();
      expect(msg.name).toBeUndefined();
      expect(msg.toolCalls).toBeUndefined();
      expect(msg.toolCallId).toBeUndefined();
    });

    it('converts a system message', () => {
      const loopMsg: LoopMessage = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.role).toBe('system');
      expect(msg.content).toBe('You are a helpful assistant.');
      expect(msg.id).toBeDefined();
    });

    it('converts an assistant message with toolCalls', () => {
      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"NYC"}',
        },
      };

      const loopMsg: LoopMessage = {
        role: 'assistant',
        content: 'I will check the weather for you.',
        toolCalls: [toolCall],
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('I will check the weather for you.');
      expect(msg.toolCalls).toBeDefined();
      expect(msg.toolCalls?.length).toBe(1);
      expect(msg.toolCalls?.[0].id).toBe('call_123');
      expect(msg.toolCalls?.[0].function.name).toBe('get_weather');
    });

    it('converts a tool message with toolCallId and name', () => {
      const loopMsg: LoopMessage = {
        role: 'tool',
        content: 'The weather in NYC is sunny, 72°F',
        toolCallId: 'call_123',
        name: 'get_weather',
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.role).toBe('tool');
      expect(msg.content).toBe('The weather in NYC is sunny, 72°F');
      expect(msg.toolCallId).toBe('call_123');
      expect(msg.name).toBe('get_weather');
      expect(msg.id).toBeDefined();
    });

    it('handles undefined content as empty string', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: undefined,
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.content).toBe('');
    });

    it('handles null content as empty string', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: null,
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.content).toBe('');
    });

    it('converts non-string content to string', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: 42,
      };

      const msg = loopMessageToMessage(loopMsg);

      expect(msg.content).toBe('42');
    });

    it('includes sessionId in metadata when provided', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: 'Hello',
      };

      const msg = loopMessageToMessage(loopMsg, 'session_456');

      expect(msg.metadata?.sessionId).toBe('session_456');
    });

    it('generates unique IDs for different messages', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: 'Hello',
      };

      const msg1 = loopMessageToMessage(loopMsg);
      const msg2 = loopMessageToMessage(loopMsg);

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('messageToLoopMessage', () => {
    it('converts a user message (string content) back to LoopMessage', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: 'Hello, world!',
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('user');
      expect(loopMsg.content).toBe('Hello, world!');
      expect(loopMsg.name).toBeUndefined();
      expect(loopMsg.toolCalls).toBeUndefined();
      expect(loopMsg.toolCallId).toBeUndefined();
    });

    it('converts a message with TextContent object', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello from TextContent',
        },
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('user');
      expect(loopMsg.content).toBe('Hello from TextContent');
    });

    it('converts a message with array of content items', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('user');
      expect(loopMsg.content).toBe('First part\nSecond part');
    });

    it('converts a message with mixed content array', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: [
          'String content',
          { type: 'text', text: 'TextContent object' },
        ],
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('user');
      expect(loopMsg.content).toBe('String content\nTextContent object');
    });

    it('converts assistant message with toolCalls', () => {
      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"NYC"}',
        },
      };

      const msg: Message = {
        id: 'msg_123',
        role: 'assistant',
        content: 'Checking weather...',
        toolCalls: [toolCall],
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('assistant');
      expect(loopMsg.content).toBe('Checking weather...');
      expect(loopMsg.toolCalls).toBeDefined();
      expect(loopMsg.toolCalls?.length).toBe(1);
      expect(loopMsg.toolCalls?.[0].id).toBe('call_123');
    });

    it('converts tool message with toolCallId and name', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'tool',
        content: 'Weather result',
        toolCallId: 'call_123',
        name: 'get_weather',
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.role).toBe('tool');
      expect(loopMsg.content).toBe('Weather result');
      expect(loopMsg.toolCallId).toBe('call_123');
      expect(loopMsg.name).toBe('get_weather');
    });

    it('strips metadata (only in Message type)', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: 'Hello',
        metadata: {
          timestamp: Date.now(),
          model: 'claude-3-sonnet',
        },
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg).not.toHaveProperty('metadata');
      expect(loopMsg).not.toHaveProperty('id');
    });

    it('handles content array with non-text items', () => {
      const msg: Message = {
        id: 'msg_123',
        role: 'user',
        content: [
          { type: 'text', text: 'Text part' },
          { type: 'image', source: { type: 'url', url: 'https://example.com/img.jpg' } },
        ],
      };

      const loopMsg = messageToLoopMessage(msg);

      expect(loopMsg.content).toBe('Text part');
    });
  });

  describe('Round-trip conversions', () => {
    it('preserves user message through round-trip', () => {
      const original: Message = {
        id: 'msg_123',
        role: 'user',
        content: 'Round trip test',
        metadata: {
          timestamp: Date.now(),
        },
      };

      const loopMsg = messageToLoopMessage(original);
      const reconstructed = loopMessageToMessage(loopMsg);

      expect(reconstructed.role).toBe(original.role);
      expect(reconstructed.content).toBe(original.content);
      expect(reconstructed.name).toBe(original.name);
      expect(reconstructed.toolCalls).toEqual(original.toolCalls);
      expect(reconstructed.toolCallId).toBe(original.toolCallId);
    });

    it('preserves assistant message with toolCalls through round-trip', () => {
      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_fn',
          arguments: '{}',
        },
      };

      const original: Message = {
        id: 'msg_123',
        role: 'assistant',
        content: 'Calling function...',
        toolCalls: [toolCall],
      };

      const loopMsg = messageToLoopMessage(original);
      const reconstructed = loopMessageToMessage(loopMsg);

      expect(reconstructed.role).toBe('assistant');
      expect(reconstructed.content).toBe('Calling function...');
      expect(reconstructed.toolCalls).toEqual([toolCall]);
    });

    it('preserves tool message through round-trip', () => {
      const original: Message = {
        id: 'msg_123',
        role: 'tool',
        content: 'Tool result',
        toolCallId: 'call_123',
        name: 'test_fn',
      };

      const loopMsg = messageToLoopMessage(original);
      const reconstructed = loopMessageToMessage(loopMsg);

      expect(reconstructed.role).toBe('tool');
      expect(reconstructed.content).toBe('Tool result');
      expect(reconstructed.toolCallId).toBe('call_123');
      expect(reconstructed.name).toBe('test_fn');
    });

    it('preserves system message through round-trip', () => {
      const original: Message = {
        id: 'msg_123',
        role: 'system',
        content: 'You are helpful.',
      };

      const loopMsg = messageToLoopMessage(original);
      const reconstructed = loopMessageToMessage(loopMsg);

      expect(reconstructed.role).toBe('system');
      expect(reconstructed.content).toBe('You are helpful.');
    });

    it('extracts text from complex content in round-trip', () => {
      const original: Message = {
        id: 'msg_123',
        role: 'user',
        content: [
          { type: 'text', text: 'Part A' },
          { type: 'text', text: 'Part B' },
        ],
      };

      const loopMsg = messageToLoopMessage(original);
      expect(loopMsg.content).toBe('Part A\nPart B');

      const reconstructed = loopMessageToMessage(loopMsg);
      expect(reconstructed.content).toBe('Part A\nPart B');
      expect(reconstructed.role).toBe('user');
    });
  });

  describe('Edge cases', () => {
    it('handles empty string content', () => {
      const loopMsg: LoopMessage = {
        role: 'user',
        content: '',
      };

      const msg = loopMessageToMessage(loopMsg);
      expect(msg.content).toBe('');

      const backToLoop = messageToLoopMessage(msg);
      expect(backToLoop.content).toBe('');
    });

    it('handles multiple toolCalls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'fn1', arguments: '{}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'fn2', arguments: '{}' },
        },
      ];

      const msg: Message = {
        role: 'assistant',
        content: 'Calling multiple functions...',
        toolCalls,
      };

      const loopMsg = messageToLoopMessage(msg);
      const reconstructed = loopMessageToMessage(loopMsg);

      expect(reconstructed.toolCalls?.length).toBe(2);
      expect(reconstructed.toolCalls).toEqual(toolCalls);
    });

    it('handles content with special characters', () => {
      const content = 'Hello\nWorld\t!\n\n"Quoted"';
      const loopMsg: LoopMessage = {
        role: 'user',
        content,
      };

      const msg = loopMessageToMessage(loopMsg);
      expect(msg.content).toBe(content);

      const backToLoop = messageToLoopMessage(msg);
      expect(backToLoop.content).toBe(content);
    });

    it('handles very long content', () => {
      const longContent = 'x'.repeat(10000);
      const msg: Message = {
        role: 'user',
        content: longContent,
      };

      const loopMsg = messageToLoopMessage(msg);
      expect(loopMsg.content).toBe(longContent);

      const reconstructed = loopMessageToMessage(loopMsg);
      expect(reconstructed.content).toBe(longContent);
    });

    it('handles message with only name field', () => {
      const msg: Message = {
        role: 'tool',
        content: 'Result',
        name: 'function_name',
      };

      const loopMsg = messageToLoopMessage(msg);
      expect(loopMsg.name).toBe('function_name');

      const reconstructed = loopMessageToMessage(loopMsg);
      expect(reconstructed.name).toBe('function_name');
    });

    it('handles message with only toolCallId field', () => {
      const msg: Message = {
        role: 'tool',
        content: 'Result',
        toolCallId: 'call_xyz',
      };

      const loopMsg = messageToLoopMessage(msg);
      expect(loopMsg.toolCallId).toBe('call_xyz');

      const reconstructed = loopMessageToMessage(loopMsg);
      expect(reconstructed.toolCallId).toBe('call_xyz');
    });

    it('preserves JSON-like content as string', () => {
      const jsonContent =
        '{"key": "value", "nested": {"count": 42}}';
      const msg: Message = {
        role: 'user',
        content: jsonContent,
      };

      const loopMsg = messageToLoopMessage(msg);
      expect(loopMsg.content).toBe(jsonContent);
    });
  });
});
