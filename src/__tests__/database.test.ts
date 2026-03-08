/**
 * Unit tests for SessionDatabase
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SessionDatabase } from '../session/database';
import type { Session, SessionState } from '../types/session';
import type { Message } from '../types/message';

describe('SessionDatabase', () => {
  let db: SessionDatabase;
  
  beforeEach(() => {
    // Use in-memory database for tests
    db = new SessionDatabase({ path: ':memory:' });
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('Session CRUD operations', () => {
    test('should save and load a session', () => {
      const session: Session = {
        id: 'test-session-1',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: 'Test Session',
          description: 'A test session',
          tags: ['test', 'example'],
        },
      };
      
      db.saveSession(session);
      const loaded = db.loadSession(session.id);
      
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(session.id);
      expect(loaded?.state).toBe(session.state);
      expect(loaded?.metadata.title).toBe(session.metadata.title);
      expect(loaded?.metadata.tags).toEqual(session.metadata.tags);
    });
    
    test('should update an existing session', () => {
      const session: Session = {
        id: 'test-session-2',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: 'Original Title',
        },
      };
      
      db.saveSession(session);
      
      // Update session
      session.metadata.title = 'Updated Title';
      session.state = 'completed';
      db.saveSession(session);
      
      const loaded = db.loadSession(session.id);
      expect(loaded?.metadata.title).toBe('Updated Title');
      expect(loaded?.state).toBe('completed');
    });
    
    test('should delete a session', () => {
      const session: Session = {
        id: 'test-session-3',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      const deleted = db.deleteSession(session.id);
      
      expect(deleted).toBe(true);
      expect(db.loadSession(session.id)).toBeNull();
    });
    
    test('should return false when deleting non-existent session', () => {
      const deleted = db.deleteSession('non-existent-id');
      expect(deleted).toBe(false);
    });
  });
  
  describe('Message operations', () => {
    test('should save and load messages', () => {
      const sessionId = 'test-session-4';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, world!',
        metadata: {
          timestamp: Date.now(),
        },
      };
      
      db.saveMessage(sessionId, message);
      
      const messages = db.loadMessages(sessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(message.id);
      expect(messages[0].role).toBe(message.role);
      expect(messages[0].content).toBe(message.content);
    });
    
    test('should save messages with complex content', () => {
      const sessionId = 'test-session-5';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      const message: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the result:' },
          { type: 'text', text: 'Result data' },
        ],
        metadata: {
          timestamp: Date.now(),
          model: 'claude-3',
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        },
      };
      
      db.saveMessage(sessionId, message);
      
      const messages = db.loadMessages(sessionId);
      expect(messages).toHaveLength(1);
      expect(Array.isArray(messages[0].content)).toBe(true);
      expect(messages[0].metadata?.usage?.totalTokens).toBe(150);
    });
    
    test('should delete messages when session is deleted (cascade)', () => {
      const sessionId = 'test-session-6';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      const message: Message = {
        id: 'msg-3',
        role: 'user',
        content: 'Test message',
        metadata: {
          timestamp: Date.now(),
        },
      };
      
      db.saveMessage(sessionId, message);
      db.deleteSession(sessionId);
      
      const messages = db.loadMessages(sessionId);
      expect(messages).toHaveLength(0);
    });
  });
  
  describe('Session listing and filtering', () => {
    beforeEach(() => {
      // Create test sessions with different states
      const states: SessionState[] = ['active', 'completed', 'archived'];
      states.forEach((state, index) => {
        const session: Session = {
          id: `list-session-${index}`,
          state,
          messages: [],
          metadata: {
            createdAt: Date.now() - (index * 1000),
            updatedAt: Date.now() - (index * 1000),
            title: `Session ${index}`,
            tags: index % 2 === 0 ? ['test'] : ['prod'],
          },
        };
        db.saveSession(session);
      });
    });
    
    test('should list all sessions', () => {
      const sessions = db.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });
    
    test('should filter sessions by state', () => {
      const activeSessions = db.listSessions({ state: 'active' });
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].state).toBe('active');
    });
    
    test('should filter sessions by tags', () => {
      const testSessions = db.listSessions({ tags: ['test'] });
      expect(testSessions.length).toBeGreaterThanOrEqual(1);
      testSessions.forEach(session => {
        expect(session.metadata.tags).toContain('test');
      });
    });
    
    test('should limit number of results', () => {
      const sessions = db.listSessions({ limit: 2 });
      expect(sessions).toHaveLength(2);
    });
    
    test('should apply offset', () => {
      const allSessions = db.listSessions();
      const offsetSessions = db.listSessions({ offset: 1, limit: 1 });
      
      expect(offsetSessions).toHaveLength(1);
      if (allSessions.length > 1) {
        expect(offsetSessions[0].id).toBe(allSessions[1].id);
      }
    });
  });
  
  describe('Session statistics', () => {
    test('should calculate session statistics', () => {
      const sessionId = 'stats-session-1';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      // Add messages with usage data
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          metadata: {
            timestamp: Date.now(),
            usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
            executionTime: 100,
          },
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          metadata: {
            timestamp: Date.now() + 1000,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            executionTime: 200,
          },
        },
      ];
      
      messages.forEach(msg => db.saveMessage(sessionId, msg));
      
      const stats = db.getStatistics(sessionId);
      
      expect(stats).not.toBeNull();
      expect(stats?.messageCount).toBe(2);
      expect(stats?.totalTokens).toBe(40);
      expect(stats?.promptTokens).toBe(20);
      expect(stats?.completionTokens).toBe(20);
      expect(stats?.averageResponseTime).toBe(150);
    });
    
    test('should return null for non-existent session', () => {
      const stats = db.getStatistics('non-existent');
      expect(stats).toBeNull();
    });
  });
  
  describe('Session metadata operations', () => {
    test('should update session metadata', () => {
      const sessionId = 'metadata-session-1';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          title: 'Original',
        },
      };
      
      db.saveSession(session);
      
      const updated = db.updateMetadata(sessionId, {
        title: 'Updated',
        description: 'New description',
        tags: ['new-tag'],
      });
      
      expect(updated).toBe(true);
      
      const loaded = db.loadSession(sessionId);
      expect(loaded?.metadata.title).toBe('Updated');
      expect(loaded?.metadata.description).toBe('New description');
      expect(loaded?.metadata.tags).toEqual(['new-tag']);
    });
    
    test('should update session state', () => {
      const sessionId = 'state-session-1';
      const session: Session = {
        id: sessionId,
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      const updated = db.updateState(sessionId, 'completed');
      expect(updated).toBe(true);
      
      const loaded = db.loadSession(sessionId);
      expect(loaded?.state).toBe('completed');
    });
  });
  
  describe('Archive operations', () => {
    test('should archive a session', () => {
      const sessionId = 'archive-session-1';
      const session: Session = {
        id: sessionId,
        state: 'completed',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      
      const archived = db.archiveSession(sessionId);
      expect(archived).toBe(true);
      
      const loaded = db.loadSession(sessionId);
      expect(loaded?.state).toBe('archived');
    });
  });
  
  describe('Clear operations', () => {
    test('should clear all sessions and messages', () => {
      const session: Session = {
        id: 'clear-session-1',
        state: 'active',
        messages: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };
      
      db.saveSession(session);
      db.clearAll();
      
      const sessions = db.listSessions();
      expect(sessions).toHaveLength(0);
    });
  });
  
  describe('Transaction support', () => {
    test('should execute transactions', () => {
      const result = db.transaction(() => {
        const session: Session = {
          id: 'tx-session-1',
          state: 'active',
          messages: [],
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        };
        
        db.saveSession(session);
        return db.loadSession(session.id);
      });
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('tx-session-1');
    });
  });
});
