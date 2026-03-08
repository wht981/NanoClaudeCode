/**
 * Base provider class with common functionality for all LLM providers
 */

import type {
  LLMProvider,
  LLMModel,
  LLMResponse,
  LLMStreamChunk,
  LLMCompletionOptions,
} from '../types/llm.ts';

/**
 * Error types for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class RateLimitError extends LLMError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends LLMError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION', 401);
    this.name = 'AuthenticationError';
  }
}

export class InvalidRequestError extends LLMError {
  constructor(message: string) {
    super(message, 'INVALID_REQUEST', 400);
    this.name = 'InvalidRequestError';
  }
}

export class ModelNotFoundError extends LLMError {
  constructor(message: string) {
    super(message, 'MODEL_NOT_FOUND', 404);
    this.name = 'ModelNotFoundError';
  }
}

export class ContextLengthExceededError extends LLMError {
  constructor(message: string) {
    super(message, 'CONTEXT_LENGTH_EXCEEDED', 400);
    this.name = 'ContextLengthExceededError';
  }
}

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute?: number;
}

/**
 * Base configuration for all providers
 */
export interface BaseProviderConfig {
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  timeout?: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly supportedModels: LLMModel[];

  protected readonly retryConfig: RetryConfig;
  protected readonly timeout: number;
  
  // Rate limiting state
  private requestTimestamps: number[] = [];
  private readonly rateLimitConfig?: RateLimitConfig;

  constructor(config: BaseProviderConfig = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.rateLimitConfig = config.rateLimit;
    this.timeout = config.timeout ?? 60000;
  }

  /**
   * Abstract methods that must be implemented by concrete providers
   */
  abstract complete(options: LLMCompletionOptions): Promise<LLMResponse>;
  abstract streamComplete(options: LLMCompletionOptions): AsyncIterable<LLMStreamChunk>;
  abstract getModels(): Promise<LLMModel[]>;

  /**
   * Execute a function with retry logic and rate limiting
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryableStatusCodes: Set<number> = new Set([429, 500, 502, 503, 504])
  ): Promise<T> {
    await this.checkRateLimit();

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.withTimeout(fn());
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-retryable errors
        if (error instanceof LLMError && !retryableStatusCodes.has(error.statusCode ?? 0)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
          this.retryConfig.maxDelayMs
        );

        // If rate limited, use retry-after header if available
        if (error instanceof RateLimitError && error.retryAfter) {
          await this.sleep(error.retryAfter * 1000);
        } else {
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new LLMError('Max retries exceeded', 'MAX_RETRIES_EXCEEDED');
  }

  /**
   * Check rate limit before making a request
   */
  private async checkRateLimit(): Promise<void> {
    if (!this.rateLimitConfig) {
      return;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Check if we've exceeded the rate limit
    if (this.requestTimestamps.length >= this.rateLimitConfig.requestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0]!;
      const waitTime = 60000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
        // Recursively check again after waiting
        return this.checkRateLimit();
      }
    }

    // Record this request
    this.requestTimestamps.push(now);
  }

  /**
   * Execute a function with timeout
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new LLMError(
          `Request timed out after ${this.timeout}ms`,
          'TIMEOUT',
          408
        ));
      }, this.timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Sleep for a given number of milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate completion options
   */
  protected validateOptions(options: LLMCompletionOptions): void {
    if (!options.model) {
      throw new InvalidRequestError('Model is required');
    }

    if (!options.messages || options.messages.length === 0) {
      throw new InvalidRequestError('At least one message is required');
    }

    if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
      throw new InvalidRequestError('Temperature must be between 0 and 2');
    }

    if (options.topP !== undefined && (options.topP < 0 || options.topP > 1)) {
      throw new InvalidRequestError('Top P must be between 0 and 1');
    }

    if (options.maxTokens !== undefined && options.maxTokens < 1) {
      throw new InvalidRequestError('Max tokens must be at least 1');
    }
  }

  /**
   * Get a model by ID
   */
  protected getModelById(modelId: string): LLMModel | undefined {
    return this.supportedModels.find(m => m.id === modelId);
  }

  /**
   * Check if a model is supported
   */
  protected isModelSupported(modelId: string): boolean {
    return this.supportedModels.some(m => m.id === modelId);
  }
}
