import { describe, expect, test } from 'bun:test';
import type {
  LLMCompletionOptions,
  LLMModel,
  LLMProvider,
  LLMResponse,
  LLMStreamChunk,
} from '../types/llm.ts';
import { BaseTool } from '../tools/base.ts';
import { ToolRegistry } from '../tools/registry.ts';
import { ToolExecutor } from '../tools/executor.ts';
import { AgenticLoop } from './agentic.ts';

class EchoTool extends BaseTool {
  public callCount = 0;

  constructor() {
    super('echo', 'Echo a value', {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          description: 'Value to echo',
        },
      },
      required: ['value'],
    });
  }

  async execute(args: Record<string, unknown>) {
    this.callCount += 1;
    return {
      success: true,
      output: String(args.value),
    };
  }
}

class MockProvider implements LLMProvider {
  readonly name = 'mock-provider';
  readonly supportedModels: LLMModel[] = [
    {
      id: 'mock-model',
      name: 'Mock Model',
      contextWindow: 8192,
      maxOutputTokens: 1024,
      supportsFunctions: true,
      supportsStreaming: true,
    },
  ];

  public completionCalls: LLMCompletionOptions[] = [];
  public streamCalls: LLMCompletionOptions[] = [];
  public completionResponses: Array<LLMResponse | Error> = [];
  public streamResponses: Array<Array<LLMStreamChunk> | Error> = [];

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    this.completionCalls.push(options);
    const next = this.completionResponses.shift();
    if (!next) {
      throw new Error('No completion response queued');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncIterable<LLMStreamChunk> {
    this.streamCalls.push(options);
    const next = this.streamResponses.shift();
    if (!next) {
      throw new Error('No stream response queued');
    }
    if (next instanceof Error) {
      throw next;
    }
    for (const chunk of next) {
      yield chunk;
    }
  }

  async getModels(): Promise<LLMModel[]> {
    return this.supportedModels;
  }
}

function createToolExecutor(tool?: BaseTool): ToolExecutor {
  const registry = new ToolRegistry();
  if (tool) {
    registry.register(tool);
  }
  return new ToolExecutor(registry);
}

describe('AgenticLoop', () => {
  test('executes tool calls and feeds tool result back to LLM', async () => {
    const provider = new MockProvider();
    const echoTool = new EchoTool();
    const loop = new AgenticLoop({
      provider,
      executor: createToolExecutor(echoTool),
      model: 'mock-model',
      tools: [echoTool],
      systemPrompt: 'You are a test assistant.',
    });

    provider.completionResponses.push(
      {
        content: 'I will call a tool.',
        model: 'mock-model',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'echo',
              arguments: '{"value":"hello"}',
            },
          },
        ],
      },
      {
        content: 'Final answer: hello',
        model: 'mock-model',
        usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
        finishReason: 'stop',
      }
    );

    const result = await loop.run({ input: 'say hello' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Final answer: hello');
    expect(result.iterations).toBe(2);
    expect(echoTool.callCount).toBe(1);
    expect(provider.completionCalls.length).toBe(2);

    const secondCallMessages = provider.completionCalls[1]?.messages ?? [];
    const toolMessage = secondCallMessages.find((message) => message.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.toolCallId).toBe('call_1');
    expect(toolMessage?.content).toBe('hello');
  });

  test('stops when max iterations is reached', async () => {
    const provider = new MockProvider();
    const echoTool = new EchoTool();
    const loop = new AgenticLoop({
      provider,
      executor: createToolExecutor(echoTool),
      model: 'mock-model',
      tools: [echoTool],
      maxIterations: 2,
    });

    provider.completionResponses.push(
      {
        content: '',
        model: 'mock-model',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'loop_1',
            type: 'function',
            function: {
              name: 'echo',
              arguments: '{"value":"a"}',
            },
          },
        ],
      },
      {
        content: '',
        model: 'mock-model',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'loop_2',
            type: 'function',
            function: {
              name: 'echo',
              arguments: '{"value":"b"}',
            },
          },
        ],
      }
    );

    const result = await loop.run({ input: 'loop forever' });

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.error).toContain('Reached max iterations');
  });

  test('includes tool execution errors in conversation context', async () => {
    const provider = new MockProvider();
    const loop = new AgenticLoop({
      provider,
      executor: createToolExecutor(),
      model: 'mock-model',
      tools: [
        new EchoTool(),
      ],
    });

    provider.completionResponses.push(
      {
        content: 'Need a missing tool.',
        model: 'mock-model',
        usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'missing_tool_call',
            type: 'function',
            function: {
              name: 'missing_tool',
              arguments: '{}',
            },
          },
        ],
      },
      {
        content: 'I handled the tool error.',
        model: 'mock-model',
        usage: { promptTokens: 3, completionTokens: 3, totalTokens: 6 },
        finishReason: 'stop',
      }
    );

    const result = await loop.run({ input: 'trigger missing tool' });

    expect(result.success).toBe(true);
    expect(provider.completionCalls.length).toBe(2);
    const secondCallMessages = provider.completionCalls[1]?.messages ?? [];
    const toolMessage = secondCallMessages.find((message) => message.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(String(toolMessage?.content)).toContain("Tool 'missing_tool' failed");
  });

  test('aborts after consecutive provider errors', async () => {
    const provider = new MockProvider();
    const loop = new AgenticLoop({
      provider,
      executor: createToolExecutor(),
      model: 'mock-model',
      maxConsecutiveErrors: 2,
    });

    provider.completionResponses.push(new Error('provider down'), new Error('provider still down'));

    const result = await loop.run({ input: 'hello' });

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.error).toContain('Aborted after 2 consecutive errors');
  });

  test('streams reason, act, observe, and final events', async () => {
    const provider = new MockProvider();
    const echoTool = new EchoTool();
    const loop = new AgenticLoop({
      provider,
      executor: createToolExecutor(echoTool),
      model: 'mock-model',
      tools: [echoTool],
    });

    provider.streamResponses.push(
      [
        {
          content: 'Thinking... ',
          model: 'mock-model',
        },
        {
          content: '',
          model: 'mock-model',
          finishReason: 'tool_calls',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          toolCalls: [
            {
              id: 'stream_call_1',
              type: 'function',
              function: {
                name: 'echo',
                arguments: '{"value":"streamed"}',
              },
            },
          ],
        },
      ],
      [
        {
          content: 'Done.',
          model: 'mock-model',
          finishReason: 'stop',
          usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
        },
      ]
    );

    const events = [];
    for await (const event of loop.stream({ input: 'stream please' })) {
      events.push(event);
    }

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain('reason');
    expect(eventTypes).toContain('act');
    expect(eventTypes).toContain('observe');
    expect(eventTypes[eventTypes.length - 1]).toBe('final');

    const finalEvent = events[events.length - 1];
    expect(finalEvent).toBeDefined();
    if (!finalEvent) {
      throw new Error('Expected final event');
    }
    expect(finalEvent.type).toBe('final');
    if (finalEvent.type === 'final') {
      expect(finalEvent.result.success).toBe(true);
      expect(finalEvent.result.output).toBe('Done.');
    }
  });
});
