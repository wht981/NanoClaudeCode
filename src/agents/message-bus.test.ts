import { describe, expect, test } from 'bun:test';
import { MessageBus } from './message-bus';

describe('MessageBus', () => {
  test('publishes messages to wildcard and type subscribers', async () => {
    const bus = new MessageBus();
    const wildcard: string[] = [];
    const typed: string[] = [];

    bus.subscribe('*', (message) => {
      wildcard.push(message.type);
    });
    bus.subscribe('type:task.update', (message) => {
      typed.push(String(message.payload));
    });

    await bus.publish({
      from: 'agent-a',
      type: 'task.update',
      payload: 'done',
    });

    expect(wildcard).toEqual(['task.update']);
    expect(typed).toEqual(['done']);
  });

  test('routes direct messages to target agent subscribers', async () => {
    const bus = new MessageBus();
    const directPayloads: string[] = [];

    bus.subscribeAgent('agent-b', (message) => {
      directPayloads.push(JSON.stringify(message.payload));
    });

    await bus.sendToAgent('agent-a', 'agent-b', 'handoff', { work: 42 });

    expect(directPayloads).toHaveLength(1);
    expect(directPayloads[0]).toContain('42');
  });

  test('supports channel subscriptions and unsubscription', async () => {
    const bus = new MessageBus();
    const channelHits: string[] = [];

    const unsubscribe = bus.subscribe('channel:planning', (message) => {
      channelHits.push(message.type);
    });

    await bus.publish({
      from: 'orchestrator',
      type: 'plan.created',
      channel: 'planning',
      payload: { id: 'plan-1' },
    });

    unsubscribe();

    await bus.publish({
      from: 'orchestrator',
      type: 'plan.updated',
      channel: 'planning',
      payload: { id: 'plan-1' },
    });

    expect(channelHits).toEqual(['plan.created']);
  });

  test('stores and filters message history', async () => {
    const bus = new MessageBus();

    await bus.publish({
      from: 'agent-a',
      to: 'agent-b',
      type: 'sync',
      payload: 'first',
      channel: 'coordination',
    });

    await bus.publish({
      from: 'agent-b',
      type: 'sync',
      payload: 'second',
      channel: 'coordination',
    });

    expect(bus.getHistory()).toHaveLength(2);
    expect(bus.getHistory({ from: 'agent-a' })).toHaveLength(1);
    expect(bus.getHistory({ to: 'agent-b' })).toHaveLength(1);
    expect(bus.getHistory({ type: 'sync', channel: 'coordination' })).toHaveLength(2);

    bus.clearHistory();
    expect(bus.getHistory()).toHaveLength(0);
  });
});
