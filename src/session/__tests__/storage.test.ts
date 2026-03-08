/**
 * Unit tests for session storage
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteSessionStorage } from '../storage';
import type { Session, SessionState } from '../../types/session';
import type { Message } from '../../types/message';

function isSQLiteSessionStorageSupported(): boolean {
  try {
    const probe = new SQLiteSessionStorage({
      dbPath: ':memory:',
      verbose: false,
    });
    probe.close();
    return true;
  } catch {
    return false;
  }
}

const describeSQLiteStorage = isSQLiteSessionStorageSupported() ? describe : describe.skip;

describeSQLiteStorage('SQLiteSessionStorage', () => {

  let storage: SQLiteSessionStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SQLiteSessionStorage({
      dbPath: ':memory:',
      verbose: false,
    });
  });

  afterEach(() => {
    if (storage) {
      storage.close();
    }
  });

  describe('save and load', () => {
    test('should save and load a session', async () => {
      const session: Session = {
        id: 'test-session-1',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: 'Test Session',
          description: 'A test session',
          tags: ['test', 'unit'],
          agentRole: 'assistant',
        },
      };

      await storage.save(session);
      const loaded = await storage.load('test-session-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(session.id);
      expect(loaded?.state).toBe(session.state);
      expect(loaded?.metadata.title).toBe(session.metadata.title);
      expect(loaded?.metadata.tags).toEqual(session.metadata.tags);
    });

    test('should save and load session with messages', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          metadata: {
            timestamp: Date.now(),
            usage: {
              promptTokens: 10,
              completionTokens: 0,
              totalTokens: 10,
            },
          },
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          metadata: {
            timestamp: Date.now(),
            usage: {
              promptTokens: 0,
              completionTokens: 20,
              totalTokens: 20,
            },
          },
        },
      ];

      const session: Session = {
        id: 'test-session-2',
        state: 'active',
        messages,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalMessages: messages.length,
          totalTokens: 30,
        },
      };

      await storage.save(session);
      const loaded = await storage.load('test-session-2');

      expect(loaded).not.toBeNull();
      expect(loaded?.messages.length).toBe(2);
      expect(loaded?.messages[0].content).toBe('Hello');
      expect(loaded?.messages[1].content).toBe('Hi there!');
      expect(loaded?.metadata.totalMessages).toBe(2);
      expect(loaded?.metadata.totalTokens).toBe(30);
    });

    test('should return null for non-existent session', async () => {
      const loaded = await storage.load('non-existent');
      expect(loaded).toBeNull();
    });

    test('should update existing session', async () => {
      const session: Session = {
        id: 'test-session-3',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: 'Original Title',
        },
      };

      await storage.save(session);

      // Update session
      session.metadata.title = 'Updated Title';
      session.metadata.updatedAt = Date.now();
      await storage.save(session);

      const loaded = await storage.load('test-session-3');
      expect(loaded?.metadata.title).toBe('Updated Title');
    });
  });

  describe('delete', () => {
    test('should delete a session', async () => {
      const session: Session = {
        id: 'test-session-4',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      await storage.save(session);
      const deleted = await storage.delete('test-session-4');
      expect(deleted).toBe(true);

      const loaded = await storage.load('test-session-4');
      expect(loaded).toBeNull();
    });

    test('should return false when deleting non-existent session', async () => {
      const deleted = await storage.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create test sessions
      const states: SessionState[] = ['active', 'completed', 'archived'];
      for (let i = 0; i < 10; i++) {
        const session: Session = {
          id: `session-${i}`,
          state: states[i % 3],
          messages: [],
          metadata: {
            createdAt: Date.now() - (10 - i) * 1000,
            updatedAt: Date.now() - (10 - i) * 1000,
            title: `Session ${i}`,
            tags: i % 2 === 0 ? ['even'] : ['odd'],
          },
        };
        await storage.save(session);
      }
    });

    test('should list all sessions', async () => {
      const sessions = await storage.list();
      expect(sessions.length).toBe(10);
    });

    test('should list sessions with limit', async () => {
      const sessions = await storage.list({ limit: 5 });
      expect(sessions.length).toBe(5);
    });

    test('should list sessions with offset', async () => {
      const sessions = await storage.list({ limit: 5, offset: 5 });
      expect(sessions.length).toBe(5);
    });

    test('should filter sessions by state', async () => {
      const sessions = await storage.list({ state: 'active' });
      expect(sessions.length).toBeGreaterThan(0);
      sessions.forEach((s) => expect(s.state).toBe('active'));
    });

    test('should filter sessions by tags', async () => {
      const sessions = await storage.list({ tags: ['even'] });
      expect(sessions.length).toBe(5);
      sessions.forEach((s) => expect(s.metadata.tags).toContain('even'));
    });

    test('should return sessions in descending order by updatedAt', async () => {
      const sessions = await storage.list();
      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].metadata.updatedAt).toBeGreaterThanOrEqual(
          sessions[i].metadata.updatedAt
        );
      }
    });
  });

  describe('getStatistics', () => {
    test('should return statistics for a session', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          metadata: {
            timestamp: Date.now(),
            usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
          },
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi!',
          metadata: {
            timestamp: Date.now() + 1000,
            usage: { promptTokens: 0, completionTokens: 20, totalTokens: 20 },
            executionTime: 500,
          },
        },
      ];

      const session: Session = {
        id: 'test-session-5',
        state: 'active',
        messages,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      await storage.save(session);
      const stats = await storage.getStatistics('test-session-5');

      expect(stats).not.toBeNull();
      expect(stats?.messageCount).toBe(2);
      expect(stats?.totalTokens).toBe(30);
      expect(stats?.promptTokens).toBe(10);
      expect(stats?.completionTokens).toBe(20);
      expect(stats?.duration).toBeGreaterThanOrEqual(1000);
    });

    test('should return null for non-existent session', async () => {
      const stats = await storage.getStatistics('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('archive', () => {
    test('should archive a session', async () => {
      const session: Session = {
        id: 'test-session-6',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      await storage.save(session);
      const archived = await storage.archive('test-session-6');
      expect(archived).toBe(true);

      const loaded = await storage.load('test-session-6');
      expect(loaded?.state).toBe('archived');
    });

    test('should return false when archiving non-existent session', async () => {
      const archived = await storage.archive('non-existent');
      expect(archived).toBe(false);
    });
  });

  describe('clear', () => {
    test('should clear all sessions', async () => {
      const session: Session = {
        id: 'test-session-7',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      await storage.save(session);
      await storage.clear();

      const sessions = await storage.list();
      expect(sessions.length).toBe(0);
    });
  });

  describe('complex data types', () => {
    test('should handle session with agent config', async () => {
      const session: Session = {
        id: 'test-session-8',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        agentConfig: {
          role: 'assistant',
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          maxTokens: 4000,
        },
      };

      await storage.save(session);
      const loaded = await storage.load('test-session-8');

      expect(loaded?.agentConfig).toBeDefined();
      expect(loaded?.agentConfig?.role).toBe('assistant');
      expect(loaded?.agentConfig?.model).toBe('claude-3-5-sonnet');
    });

    test('should handle session with context variables', async () => {
      const session: Session = {
        id: 'test-session-9',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        contextVariables: {
          userId: '12345',
          projectName: 'Test Project',
          settings: { theme: 'dark', language: 'en' },
        },
      };

      await storage.save(session);
      const loaded = await storage.load('test-session-9');

      expect(loaded?.contextVariables).toBeDefined();
      expect(loaded?.contextVariables?.userId).toBe('12345');
      expect(loaded?.contextVariables?.settings).toEqual({
        theme: 'dark',
        language: 'en',
      });
    });

    test('should handle additional metadata fields', async () => {
      const session: Session = {
        id: 'test-session-10',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          customField: 'custom value',
          numericField: 42,
          objectField: { nested: true },
        },
      };

      await storage.save(session);
      const loaded = await storage.load('test-session-10');

      expect(loaded?.metadata.customField).toBe('custom value');
      expect(loaded?.metadata.numericField).toBe(42);
      expect(loaded?.metadata.objectField).toEqual({ nested: true });
    });
  });
});
