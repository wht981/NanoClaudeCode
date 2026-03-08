/**
 * Mock LLM Utilities for Testing
 * Provides factories for creating mock LLM responses
 */

export interface MockLLMResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface MockToolCall {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Factory for creating mock text responses
 */
export function createMockTextResponse(
  text: string,
  model: string = 'claude-3-5-sonnet',
  inputTokens: number = 10,
  outputTokens: number = 20
): MockLLMResponse {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    model,
    stop_reason: 'end_turn',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * Factory for creating mock tool use responses
 */
export function createMockToolUseResponse(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolId: string = 'tool_call_1',
  followUpText?: string
): MockLLMResponse {
  const content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }> = [
    {
      type: 'tool_use',
      id: toolId,
      name: toolName,
      input: toolInput,
    },
  ];

  if (followUpText) {
    content.unshift({
      type: 'text',
      text: followUpText,
    });
  }

  return {
    content: content as any,
    model: 'claude-3-5-sonnet',
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 15,
      output_tokens: 30,
    },
  };
}

/**
 * Factory for creating error responses
 */
export function createMockErrorResponse(
  error: string,
  errorCode: string = 'invalid_request'
): Record<string, unknown> {
  return {
    error: {
      type: errorCode,
      message: error,
    },
  };
}

/**
 * Helper to create mock streaming responses
 */
export function createMockStreamChunk(delta: string): Record<string, unknown> {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'text_delta',
      text: delta,
    },
  };
}

/**
 * Mock LLM client for testing
 */
export class MockLLMClient {
  private responses: Map<string, MockLLMResponse> = new Map();
  private callCount: Map<string, number> = new Map();

  registerResponse(key: string, response: MockLLMResponse): void {
    this.responses.set(key, response);
  }

  async createMessage(
    key: string = 'default'
  ): Promise<MockLLMResponse> {
    const count = (this.callCount.get(key) || 0) + 1;
    this.callCount.set(key, count);

    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`No mock response registered for key: ${key}`);
    }

    return response;
  }

  getCallCount(key: string = 'default'): number {
    return this.callCount.get(key) || 0;
  }

  reset(): void {
    this.responses.clear();
    this.callCount.clear();
  }
}
