import { randomUUID } from 'node:crypto';

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  type: string;
  payload: unknown;
  channel?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PublishMessageInput {
  from: string;
  to?: string;
  type: string;
  payload: unknown;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageHistoryFilter {
  from?: string;
  to?: string;
  type?: string;
  channel?: string;
}

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

type HandlerMap = Map<string, Set<MessageHandler>>;

/**
 * In-memory pub/sub bus used for agent-to-agent coordination.
 */
export class MessageBus {
  private readonly subscribers: HandlerMap = new Map();
  private readonly history: AgentMessage[] = [];

  subscribe(topic: string, handler: MessageHandler): () => void {
    const current = this.subscribers.get(topic) ?? new Set<MessageHandler>();
    current.add(handler);
    this.subscribers.set(topic, current);

    return () => {
      const handlers = this.subscribers.get(topic);
      if (!handlers) {
        return;
      }
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(topic);
      }
    };
  }

  subscribeAgent(agentId: string, handler: MessageHandler): () => void {
    return this.subscribe(this.getAgentTopic(agentId), handler);
  }

  async publish(input: PublishMessageInput): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: randomUUID(),
      from: input.from,
      to: input.to,
      type: input.type,
      payload: input.payload,
      channel: input.channel,
      timestamp: Date.now(),
      metadata: input.metadata,
    };

    this.history.push(message);

    const handlers = this.resolveHandlers(message);
    for (const handler of handlers) {
      await handler(message);
    }

    return message;
  }

  async sendToAgent(
    from: string,
    to: string,
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AgentMessage> {
    return this.publish({
      from,
      to,
      type,
      payload,
      metadata,
    });
  }

  async broadcast(
    from: string,
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AgentMessage> {
    return this.publish({
      from,
      type,
      payload,
      metadata,
    });
  }

  getHistory(filter?: MessageHistoryFilter): AgentMessage[] {
    if (!filter) {
      return [...this.history];
    }

    return this.history.filter((message) => {
      if (filter.from !== undefined && message.from !== filter.from) {
        return false;
      }
      if (filter.to !== undefined && message.to !== filter.to) {
        return false;
      }
      if (filter.type !== undefined && message.type !== filter.type) {
        return false;
      }
      if (filter.channel !== undefined && message.channel !== filter.channel) {
        return false;
      }
      return true;
    });
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  private resolveHandlers(message: AgentMessage): Set<MessageHandler> {
    const handlers = new Set<MessageHandler>();

    this.addHandlers(handlers, '*');
    this.addHandlers(handlers, `type:${message.type}`);

    if (message.channel) {
      this.addHandlers(handlers, `channel:${message.channel}`);
    }
    if (message.to) {
      this.addHandlers(handlers, this.getAgentTopic(message.to));
    }

    return handlers;
  }

  private addHandlers(target: Set<MessageHandler>, topic: string): void {
    const handlers = this.subscribers.get(topic);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      target.add(handler);
    }
  }

  private getAgentTopic(agentId: string): string {
    return `agent:${agentId}`;
  }
}
