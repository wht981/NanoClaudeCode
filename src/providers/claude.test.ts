/**
 * Unit tests for Claude provider
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ClaudeProvider } from './claude.ts';
import type { LLMCompletionOptions } from '../types/llm.ts';
import {
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  ModelNotFoundError,
  ContextLengthExceededError,
} from './base.ts';

// Mock Anthropic SDK
const mockCreate = mock(() => Promise.resolve({
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  model: 'claude-3-5-sonnet-20240620',
  content: [
    {
      type: 'text',
      text: 'Hello! How can I help you?',
    },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
}));

const mockStreamCreate = mock(async function* () {
  yield {
    type: 'message_start',
    message: {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-sonnet-20240620',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  };
  
  yield {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  };
  
  yield {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hello' },
  };
  
  yield {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: ' world' },
  };
  
  yield {
    type: 'content_block_stop',
    index: 0,
  };
  
  yield {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 5 },
  };
  
  yield {
    type: 'message_stop',
  };
});

// Mock the Anthropic module
mock.module('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: mockCreate,
    };
    
    constructor(config: any) {
      if (!config.apiKey) {
        throw new Error('API key required');
      }
    }
  }
  
  // Mock error classes
  (MockAnthropic as any).APIError = class APIError extends Error {
    status: number;
    headers?: Record<string, string>;
    
    constructor(status: number, message: string, headers?: Record<string, string>) {
      super(message);
      this.status = status;
      this.headers = headers;
      this.name = 'APIError';
    }
  };
  
  return { default: MockAnthropic };
});

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    // Reset mocks
    mockCreate.mockClear();
    mockStreamCreate.mockClear();
    
    // Set API key in environment
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    
    provider = new ClaudeProvider();
  });

  describe('constructor', () => {
    test('initializes with API key from config', () => {
      const customProvider = new ClaudeProvider({ apiKey: 'custom-key' });
      expect(customProvider).toBeDefined();
      expect(customProvider.name).toBe('claude');
    });

    test('initializes with API key from environment', () => {
      expect(provider).toBeDefined();
      expect(provider.name).toBe('claude');
    });

    test('throws error when API key is missing', () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(() => {
        new ClaudeProvider();
      }).toThrow(AuthenticationError);
    });
  });

  describe('supportedModels', () => {
    test('returns list of supported models', async () => {
      const models = await provider.getModels();
      
      expect(models).toBeArray();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('contextWindow');
      expect(models[0]).toHaveProperty('maxOutputTokens');
      expect(models[0]).toHaveProperty('supportsFunctions');
      expect(models[0]).toHaveProperty('supportsStreaming');
    });

    test('includes Claude 3.5 Sonnet', async () => {
      const models = await provider.getModels();
      const sonnet = models.find(m => m.id === 'claude-3-5-sonnet-20240620');
      
      expect(sonnet).toBeDefined();
      expect(sonnet?.name).toBe('Claude 3.5 Sonnet');
      expect(sonnet?.supportsFunctions).toBe(true);
      expect(sonnet?.supportsStreaming).toBe(true);
    });
  });

  describe('complete', () => {
    test('generates a non-streaming response', async () => {
      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      };

      const response = await provider.complete(options);

      expect(response).toBeDefined();
      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.model).toBe('claude-3-5-sonnet-20240620');
      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(response.finishReason).toBe('stop');
    });

    test('handles system messages', async () => {
      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      };

      const response = await provider.complete(options);

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful assistant.');
    });

    test('handles temperature and other parameters', async () => {
      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        stopSequences: ['STOP'],
      };

      await provider.complete(options);

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.7);
      expect(callArgs.max_tokens).toBe(1000);
      expect(callArgs.top_p).toBe(0.9);
      expect(callArgs.stop_sequences).toEqual(['STOP']);
    });

    test('handles tool definitions', async () => {
      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the weather',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
        ],
      };

      await provider.complete(options);

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools[0].name).toBe('get_weather');
    });

    test('handles tool calls in response', async () => {
      // Mock response with tool use
      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20240620',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'get_weather',
            input: { location: 'San Francisco' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the weather',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
              },
            },
          },
        ],
      };

      const response = await provider.complete(options);

      expect(response.finishReason).toBe('tool_calls');
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0].function.name).toBe('get_weather');
      expect(response.toolCalls?.[0].function.arguments).toBe(JSON.stringify({ location: 'San Francisco' }));
    });

    test('handles tool results in messages', async () => {
      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [
          { role: 'user', content: 'What is the weather?' },
          { role: 'tool', content: '72°F and sunny', toolCallId: 'tool_123' },
        ],
      };

      await provider.complete(options);

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[1].content[0].type).toBe('tool_result');
      expect(callArgs.messages[1].content[0].tool_use_id).toBe('tool_123');
    });

    test('validates required options', async () => {
      const invalidOptions = {
        model: '',
        messages: [],
      } as LLMCompletionOptions;

      await expect(provider.complete(invalidOptions)).rejects.toThrow(InvalidRequestError);
    });
  });

  describe('streamComplete', () => {
    test('generates a streaming response', async () => {
      // Mock streaming implementation
      mockCreate.mockImplementationOnce(mockStreamCreate);

      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const chunks: string[] = [];
      for await (const chunk of provider.streamComplete(options)) {
        if (chunk.content) {
          chunks.push(chunk.content);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe('Hello world');
    });

    test('handles streaming with tool calls', async () => {
      // Mock streaming with tool use
      mockCreate.mockImplementationOnce(async function* () {
        yield {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            model: 'claude-3-5-sonnet-20240620',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        };
        
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool_123',
            name: 'get_weather',
            input: {},
          },
        };
        
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"location":',
          },
        };
        
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '"SF"}',
          },
        };
        
        yield {
          type: 'content_block_stop',
          index: 0,
        };
        
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 5 },
        };
      });

      const options: LLMCompletionOptions = {
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      };

      const chunks = [];
      for await (const chunk of provider.streamComplete(options)) {
        chunks.push(chunk);
      }

      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.finishReason).toBe('tool_calls');
      expect(finalChunk.toolCalls).toBeDefined();
      expect(finalChunk.toolCalls?.[0].function.name).toBe('get_weather');
    });
  });

});
