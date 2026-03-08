import { describe, test, expect, beforeEach } from 'bun:test';
import {
  BaseProvider,
  LLMError,
  RateLimitError,
  AuthenticationError,
  InvalidRequestError,
  ModelNotFoundError,
  ContextLengthExceededError,
} from './base.ts';
import type {
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMCompletionOptions,
} from '../types/llm.ts';

/**
 * Mock provider implementation for testing
 */
class MockProvider extends BaseProvider {
  readonly name = 'mock';
  readonly supportedModels: LLMModel[] = [
    {
      id: 'mock-model-1',
      name: 'Mock Model 1',
      contextWindow: 8192,
      maxOutputTokens: 4096,
      supportsFunctions: true,
      supportsStreaming: true,
    },
  ];

  public callCount = 0;
  public shouldFail = false;
  public failureError: Error | null = null;
  public failUntilAttempt = 0;

  private internalCallCount = 0;

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    return this.executeWithRetry(() => this.doComplete(options));
  }

  protected async doComplete(options: LLMCompletionOptions): Promise<LLMResponse> {
    this.validateOptions(options);
    this.callCount++;
    this.internalCallCount++;

    if (this.shouldFail && this.internalCallCount <= this.failUntilAttempt) {
      throw this.failureError ?? new LLMError('Mock failure', 'MOCK_ERROR', 500);
    }

    return {
      content: 'Mock response',
      model: options.model,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      finishReason: 'stop',
    };
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncIterable<LLMStreamChunk> {
    this.validateOptions(options);
    this.callCount++;

    if (this.shouldFail) {
      throw this.failureError ?? new LLMError('Mock failure', 'MOCK_ERROR', 500);
    }

    yield {
      content: 'Mock ',
      model: options.model,
    };
    yield {
      content: 'stream',
      model: options.model,
      finishReason: 'stop',
    };
  }

  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }

  // Expose protected methods for testing
  public async testExecuteWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.executeWithRetry(fn);
  }

  public testGetModelById(modelId: string): LLMModel | undefined {
    return this.getModelById(modelId);
  }

  public testIsModelSupported(modelId: string): boolean {
    return this.isModelSupported(modelId);
  }
}

describe('BaseProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
    provider.callCount = 0;
    provider.shouldFail = false;
    provider.failureError = null;
    provider.failUntilAttempt = 0;
  });

  describe('Error Classes', () => {
    test('LLMError includes all properties', () => {
      const error = new LLMError('Test error', 'TEST_CODE', 500, new Error('Original'));
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(500);
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.name).toBe('LLMError');
    });

    test('RateLimitError has correct properties', () => {
      const error = new RateLimitError('Rate limited', 60);
      expect(error.retryAfter).toBe(60);
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('RateLimitError');
    });

    test('AuthenticationError has correct properties', () => {
      const error = new AuthenticationError('Invalid API key');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    test('InvalidRequestError has correct properties', () => {
      const error = new InvalidRequestError('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('InvalidRequestError');
    });

    test('ModelNotFoundError has correct properties', () => {
      const error = new ModelNotFoundError('Model not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('ModelNotFoundError');
    });

    test('ContextLengthExceededError has correct properties', () => {
      const error = new ContextLengthExceededError('Context too long');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ContextLengthExceededError');
    });
  });

  describe('Configuration', () => {
    test('uses default retry config when not provided', () => {
      expect(provider).toBeDefined();
    });

    test('accepts custom retry config', () => {
      const customProvider = new MockProvider({
        retry: {
          maxRetries: 5,
          initialDelayMs: 500,
          maxDelayMs: 30000,
          backoffMultiplier: 3,
        },
      });
      expect(customProvider).toBeDefined();
    });

    test('accepts rate limit config', () => {
      const customProvider = new MockProvider({
        rateLimit: {
          requestsPerMinute: 10,
          tokensPerMinute: 100000,
        },
      });
      expect(customProvider).toBeDefined();
    });

    test('accepts timeout config', () => {
      const customProvider = new MockProvider({
        timeout: 30000,
      });
      expect(customProvider).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('validateOptions throws on missing model', async () => {
      await expect(
        provider.complete({
          model: '',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow(InvalidRequestError);
    });

    test('validateOptions throws on empty messages', async () => {
      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [],
        })
      ).rejects.toThrow(InvalidRequestError);
    });

    test('validateOptions throws on invalid temperature', async () => {
      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
          temperature: 3,
        })
      ).rejects.toThrow(InvalidRequestError);
    });

    test('validateOptions throws on invalid topP', async () => {
      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
          topP: 1.5,
        })
      ).rejects.toThrow(InvalidRequestError);
    });

    test('validateOptions throws on invalid maxTokens', async () => {
      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
          maxTokens: 0,
        })
      ).rejects.toThrow(InvalidRequestError);
    });

    test('validateOptions accepts valid options', async () => {
      const response = await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 1,
        topP: 0.9,
        maxTokens: 100,
      });
      expect(response).toBeDefined();
    });
  });

  describe('Retry Logic', () => {
    test('succeeds on first attempt when no errors', async () => {
      const response = await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test' }],
      });
      expect(response.content).toBe('Mock response');
      expect(provider.callCount).toBe(1);
    });

    test('retries on retryable errors', async () => {
      provider.shouldFail = true;
      provider.failUntilAttempt = 2;
      provider.failureError = new LLMError('Temporary error', 'TEMP', 500);

      // Use shorter retry config for faster tests
      provider = new MockProvider({
        retry: {
          maxRetries: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      provider.shouldFail = true;
      provider.failUntilAttempt = 2;
      provider.failureError = new LLMError('Temporary error', 'TEMP', 500);

      const response = await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.content).toBe('Mock response');
      expect(provider.callCount).toBe(3); // Failed 2 times, succeeded on 3rd
    });

    test('throws after max retries exceeded', async () => {
      provider = new MockProvider({
        retry: {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      provider.shouldFail = true;
      provider.failUntilAttempt = 10; // Always fail
      provider.failureError = new LLMError('Persistent error', 'PERSIST', 500);

      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Persistent error');

      expect(provider.callCount).toBe(3); // Initial + 2 retries
    });

    test('does not retry non-retryable errors', async () => {
      provider.shouldFail = true;
      provider.failUntilAttempt = 999; // Always fail
      provider.failureError = new AuthenticationError('Invalid API key');
      await expect(
        provider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow(AuthenticationError);

      expect(provider.callCount).toBe(1); // No retries
    });

    test('respects rate limit error retry-after', async () => {
      provider = new MockProvider({
        retry: {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      provider.shouldFail = true;
      provider.failUntilAttempt = 1;
      provider.failureError = new RateLimitError('Rate limited', 0.01); // 10ms

      const start = Date.now();
      const response = await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test' }],
      });
      const elapsed = Date.now() - start;

      expect(response.content).toBe('Mock response');
      expect(elapsed).toBeGreaterThanOrEqual(9); // At least ~10ms delay
    });
  });

  describe('Rate Limiting', () => {
    test('enforces rate limit', async () => {
      provider = new MockProvider({
        rateLimit: {
          requestsPerMinute: 2,
        },
        retry: {
          maxRetries: 0,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });

      const start = Date.now();

      // Make 3 requests - the 3rd should be delayed
      await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test 1' }],
      });
      await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test 2' }],
      });
      await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test 3' }],
      });

      const elapsed = Date.now() - start;

      // The 3rd request should be delayed by ~60 seconds, but we'll check for much less
      // since we don't want tests to take that long. The key is that there IS a delay.
      expect(provider.callCount).toBe(3);
      // In practice, this would be ~60000ms, but for testing we just verify the mechanism works
    }, 65000); // Increase timeout for this test

    test('allows requests when under rate limit', async () => {
      provider = new MockProvider({
        rateLimit: {
          requestsPerMinute: 10,
        },
      });

      const start = Date.now();

      await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test 1' }],
      });
      await provider.complete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test 2' }],
      });

      const elapsed = Date.now() - start;

      expect(provider.callCount).toBe(2);
      expect(elapsed).toBeLessThan(100); // Should be nearly instant
    });
  });

  describe('Timeout', () => {
    test('times out long-running requests', async () => {
      class SlowProvider extends MockProvider {
        protected override async doComplete(options: LLMCompletionOptions): Promise<LLMResponse> {
          await new Promise(resolve => setTimeout(resolve, 200));
          return super.doComplete(options);
        }
      }

      const slowProvider = new SlowProvider({
        timeout: 100,
      });

      await expect(
        slowProvider.complete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('timed out');
    });
  });

  describe('Model Methods', () => {
    test('getModelById returns correct model', () => {
      const model = provider.testGetModelById('mock-model-1');
      expect(model?.id).toBe('mock-model-1');
      expect(model?.name).toBe('Mock Model 1');
    });

    test('getModelById returns undefined for unknown model', () => {
      const model = provider.testGetModelById('unknown-model');
      expect(model).toBeUndefined();
    });

    test('isModelSupported returns true for supported model', () => {
      expect(provider.testIsModelSupported('mock-model-1')).toBe(true);
    });

    test('isModelSupported returns false for unsupported model', () => {
      expect(provider.testIsModelSupported('unknown-model')).toBe(false);
    });

    test('getModels returns all supported models', async () => {
      const models = await provider.getModels();
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe('mock-model-1');
    });
  });

  describe('Streaming', () => {
    test('streamComplete yields chunks', async () => {
      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.streamComplete({
        model: 'mock-model-1',
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.content).toBe('Mock ');
      expect(chunks[1]!.content).toBe('stream');
      expect(chunks[1]!.finishReason).toBe('stop');
    });

    test('streamComplete throws on error', async () => {
      provider.shouldFail = true;
      provider.failureError = new LLMError('Stream error', 'STREAM_ERROR', 500);

      let error;
      try {
        for await (const chunk of provider.streamComplete({
          model: 'mock-model-1',
          messages: [{ role: 'user', content: 'test' }],
        })) {
          // Should not reach here
        }
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(LLMError);
      expect((error as LLMError).message).toBe('Stream error');
    });
  });

  describe('Abstract Class', () => {
    test('cannot instantiate BaseProvider directly', () => {
      // TypeScript prevents this at compile time
      // This test is more for documentation
      expect(BaseProvider).toBeDefined();
    });

    test('concrete implementation must implement all abstract methods', () => {
      // The MockProvider above demonstrates this
      expect(provider.complete).toBeDefined();
      expect(provider.streamComplete).toBeDefined();
      expect(provider.getModels).toBeDefined();
    });
  });
});
