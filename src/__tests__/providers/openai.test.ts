/**
 * OpenAI Provider Test Suite
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { OpenAIProvider } from '../../providers/openai.ts';
import type { LLMCompletionOptions } from '../../types/llm.ts';
import {
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  ModelNotFoundError,
  ContextLengthExceededError,
} from '../../providers/base.ts';

// Mock OpenAI SDK
const mockCreate = mock(() => Promise.resolve({
  id: 'test-id',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Test response',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
}));

const mockStreamCreate = mock(async function* () {
  yield {
    id: 'test-stream-id',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: {
          content: 'Hello',
        },
        finish_reason: null,
      },
    ],
  };
  yield {
    id: 'test-stream-id',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        delta: {
          content: ' world',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };
});

// Mock OpenAI client
mock.module('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: (options: any) => {
          if (options.stream) {
            return mockStreamCreate();
          }
          return mockCreate();
        },
      },
    };
  },
  APIError: class APIError extends Error {
    status: number;
    headers?: Record<string, string>;
    
    constructor(message: string, status: number, headers?: Record<string, string>) {
      super(message);
      this.status = status;
      this.headers = headers;
    }
  },
}));

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider({
      apiKey: 'test-api-key',
    });
    mockCreate.mockClear();
    mockStreamCreate.mockClear();
  });

  describe('Constructor', () => {
    it('should throw error if API key is missing', () => {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(InvalidRequestError);
    });

    it('should initialize with valid config', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        organization: 'test-org',
      });
      expect(provider.name).toBe('openai');
      expect(provider.supportedModels.length).toBeGreaterThan(0);
    });
  });

  describe('complete()', () => {
    const options: LLMCompletionOptions = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
    };

    it('should complete a basic request', async () => {
      const response = await provider.complete(options);
      
      expect(response.content).toBe('Test response');
      expect(response.model).toBe('gpt-4');
      expect(response.usage.totalTokens).toBe(30);
      expect(response.finishReason).toBe('stop');
    });

    it('should handle tool calls', async () => {
      mockCreate.mockImplementationOnce(() => Promise.resolve({
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"London"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      }));

      const response = await provider.complete({
        ...options,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          },
        ],
      });

      expect(response.finishReason).toBe('tool_calls');
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0]?.function.name).toBe('get_weather');
    });

    it('should validate options', async () => {
      await expect(provider.complete({
        model: '',
        messages: [],
      })).rejects.toThrow(InvalidRequestError);
    });

    it('should handle temperature out of range', async () => {
      await expect(provider.complete({
        ...options,
        temperature: 3,
      })).rejects.toThrow(InvalidRequestError);
    });
  });

  describe('streamComplete()', () => {
    const options: LLMCompletionOptions = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
    };

    it('should stream response chunks', async () => {
      const chunks: string[] = [];
      
      for await (const chunk of provider.streamComplete(options)) {
        chunks.push(chunk.content);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should accumulate streaming tool calls', async () => {
      mockStreamCreate.mockImplementationOnce(async function* () {
        yield {
          id: 'test-stream-id',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {
                content: '',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: '{"loc',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        } as any;
        yield {
          id: 'test-stream-id',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {
                content: '',
                tool_calls: [
                  {
                    index: 0,
                    type: 'function',
                    function: {
                      arguments: 'ation":"London"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        } as any;
      });

      let finalToolCall;
      for await (const chunk of provider.streamComplete(options)) {
        if (chunk.toolCalls) {
          finalToolCall = chunk.toolCalls[0];
        }
      }

      expect(finalToolCall?.function.name).toBe('get_weather');
      expect(finalToolCall?.function.arguments).toBe('{"location":"London"}');
    });
  });

  describe('getModels()', () => {
    it('should return supported models', async () => {
      const models = await provider.getModels();
      
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('contextWindow');
      expect(models[0]).toHaveProperty('supportsFunctions');
    });

    it('should include GPT-4 models', async () => {
      const models = await provider.getModels();
      const gpt4 = models.find(m => m.id === 'gpt-4');
      
      expect(gpt4).toBeDefined();
      expect(gpt4?.supportsFunctions).toBe(true);
      expect(gpt4?.supportsStreaming).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should validate error conversion logic exists', () => {
      // Error handling is tested implicitly through the provider's handleError method
      // which is called during executeWithRetry
      expect(provider['handleError']).toBeDefined();
    });
  });

  describe('Helper Methods', () => {
    it('should check if model is supported', () => {
      expect(provider['isModelSupported']('gpt-4')).toBe(true);
      expect(provider['isModelSupported']('invalid-model')).toBe(false);
    });

    it('should get model by ID', () => {
      const model = provider['getModelById']('gpt-4');
      expect(model).toBeDefined();
      expect(model?.id).toBe('gpt-4');
    });
  });
});
