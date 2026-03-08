/**
 * Unit tests for SessionManager
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SessionManager } from '../session/manager';
import type { Session } from '../types/session';
import type { Message } from '../types/message';
import type { AgentConfig } from '../types/agent';

describe('SessionManager', () => {
  let manager: SessionManager;
  
  beforeEach(() => {
    // Use in-memory database for tests
    manager = new SessionManager({
      database: {
        path: ':memory:',
      },
      autoSaveInterval: 0, // Disable auto-save for tests
    });
  });
  
  afterEach(async () => {
    await manager.close();
  });
  
  describe('Session creation', () => {
    test('should create a new session', async () => {
      const session = await manager.createSession();
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.state).toBe('active');
      expect(session.messages).toEqual([]);
      expect(session.metadata.createdAt).toBeDefined();
    });
    
    test('should create session with agent config', async () => {
      const agentConfig: AgentConfig = {
        role: 'coder',
        name: 'Test Coder',
        description: 'A test coding agent',
        systemPrompt: 'You are a test coder',
        capabilities: {
          canExecuteTools: true,
          canStreamResponses: true,
          canAccessFiles: true,
          canAccessNetwork: false,
          canModifySystem: false,
          maxContextTokens: 100000,
        },
        llmProvider: 'anthropic',
        model: 'claude-3-opus',
      };
      
      const session = await manager.createSession(agentConfig);
      
      expect(session.agentConfig).toEqual(agentConfig);
      expect(session.metadata.title).toContain('coder');
      expect(session.metadata.agentRole).toBe('coder');
      expect(session.metadata.model).toBe('claude-3-opus');
    });
    
    test('should set created session as current', async () => {
      const session = await manager.createSession();
      const current = manager.getCurrentSession();
      
      expect(current).toBeDefined();
      expect(current?.id).toBe(session.id);
    });
  });
  
  describe('Current session management', () => {
    test('should get current session', async () => {
      const session = await manager.createSession();
      const current = manager.getCurrentSession();
      
      expect(current?.id).toBe(session.id);
    });
    
    test('should set current session by id', async () => {
      const session1 = await manager.createSession();
      const session2 = await manager.createSession();
      
      const success = await manager.setCurrentSession(session1.id);
      expect(success).toBe(true);
      
      const current = manager.getCurrentSession();
      expect(current?.id).toBe(session1.id);
    });
    
    test('should return false when setting non-existent session', async () => {
      const success = await manager.setCurrentSession('non-existent-id');
      expect(success).toBe(false);
    });
  });
  
  describe('Message management', () => {
    test('should add message to session', async () => {
      const session = await manager.createSession();
      
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello!',
        metadata: {
          timestamp: Date.now(),
        },
      };
      
      await manager.addMessage(session.id, message);
      
      const loaded = await manager.getSession(session.id);
      expect(loaded?.messages).toHaveLength(1);
      expect(loaded?.messages[0].id).toBe(message.id);
    });
    
    test('should update metadata when adding message', async () => {
      const session = await manager.createSession();
      const initialUpdatedAt = session.metadata.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const message: Message = {
        id: 'msg-2',
        role: 'user',
        content: 'Test',
        metadata: {
          timestamp: Date.now(),
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
        },
      };
      
      await manager.addMessage(session.id, message);
      
      const loaded = await manager.getSession(session.id);
      expect(loaded?.metadata.updatedAt).toBeGreaterThan(initialUpdatedAt);
      expect(loaded?.metadata.totalMessages).toBe(1);
      expect(loaded?.metadata.totalTokens).toBe(30);
    });
    
    test('should throw when adding message to non-existent session', async () => {
      const message: Message = {
        id: 'msg-3',
        role: 'user',
        content: 'Test',
        metadata: {
          timestamp: Date.now(),
        },
      };
      
      await expect(manager.addMessage('non-existent', message)).rejects.toThrow();
    });
  });
  
  describe('Metadata management', () => {
    test('should update session metadata', async () => {
      const session = await manager.createSession();
      
      await manager.updateMetadata(session.id, {
        title: 'New Title',
        description: 'New Description',
        tags: ['tag1', 'tag2'],
      });
      
      const loaded = await manager.getSession(session.id);
      expect(loaded?.metadata.title).toBe('New Title');
      expect(loaded?.metadata.description).toBe('New Description');
      expect(loaded?.metadata.tags).toEqual(['tag1', 'tag2']);
    });
    
    test('should throw when updating metadata for non-existent session', async () => {
      await expect(manager.updateMetadata('non-existent', { title: 'Test' })).rejects.toThrow();
    });
  });
  
  describe('Session lifecycle', () => {
    test('should end session', async () => {
      const session = await manager.createSession();
      
      await manager.endSession(session.id);
      
      const loaded = await manager.getSession(session.id);
      expect(loaded?.state).toBe('completed');
    });
    
    test('should archive session', async () => {
      const session = await manager.createSession();
      
      const success = await manager.archive(session.id);
      expect(success).toBe(true);
      
      const loaded = await manager.getSession(session.id);
      expect(loaded?.state).toBe('archived');
    });
  });
  
  describe('Session listing', () => {
    test('should list all sessions', async () => {
      await manager.createSession();
      await manager.createSession();
      
      const sessions = await manager.list();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });
    
    test('should list sessions with limit', async () => {
      await manager.createSession();
      await manager.createSession();
      await manager.createSession();
      
      const sessions = await manager.list({ limit: 2 });
      expect(sessions).toHaveLength(2);
    });
    
    test('should filter sessions by state', async () => {
      const session1 = await manager.createSession();
      await manager.createSession();
      
      await manager.endSession(session1.id);
      
      const completedSessions = await manager.list({ state: 'completed' });
      expect(completedSessions).toHaveLength(1);
      expect(completedSessions[0].state).toBe('completed');
    });
  });
  
  describe('Session search', () => {
    test('should search sessions by title', async () => {
      const session = await manager.createSession();
      await manager.updateMetadata(session.id, { title: 'Important Session' });
      
      const results = await manager.search('Important');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(s => s.id === session.id)).toBe(true);
    });
    
    test('should search sessions by description', async () => {
      const session = await manager.createSession();
      await manager.updateMetadata(session.id, { description: 'Testing search functionality' });
      
      const results = await manager.search('search');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(s => s.id === session.id)).toBe(true);
    });
  });
  
  describe('Session statistics', () => {
    test('should get session statistics', async () => {
      const session = await manager.createSession();
      
      const message: Message = {
        id: 'msg-stats',
        role: 'user',
        content: 'Test',
        metadata: {
          timestamp: Date.now(),
          usage: {
            promptTokens: 50,
            completionTokens: 100,
            totalTokens: 150,
          },
        },
      };
      
      await manager.addMessage(session.id, message);
      
      const stats = await manager.getStatistics(session.id);
      expect(stats).not.toBeNull();
      expect(stats?.messageCount).toBe(1);
      expect(stats?.totalTokens).toBe(150);
    });
  });
  
  describe('Session operations', () => {
    test('should export session to JSON', async () => {
      const session = await manager.createSession();
      await manager.updateMetadata(session.id, { title: 'Export Test' });
      
      const json = await manager.exportSession(session.id);
      const parsed = JSON.parse(json);
      
      expect(parsed.id).toBe(session.id);
      expect(parsed.metadata.title).toBe('Export Test');
    });
    
    test('should import session from JSON', async () => {
      const session = await manager.createSession();
      const json = await manager.exportSession(session.id);
      
      await manager.delete(session.id);
      
      const imported = await manager.importSession(json);
      expect(imported.id).toBe(session.id);
    });
    
    test('should clone session', async () => {
      const original = await manager.createSession();
      await manager.updateMetadata(original.id, { title: 'Original Session' });
      
      const message: Message = {
        id: 'msg-clone',
        role: 'user',
        content: 'Test message',
        metadata: {
          timestamp: Date.now(),
        },
      };
      
      await manager.addMessage(original.id, message);
      
      const cloned = await manager.cloneSession(original.id, 'Cloned Session');
      
      expect(cloned.id).not.toBe(original.id);
      expect(cloned.metadata.title).toBe('Cloned Session');
      expect(cloned.messages).toHaveLength(1);
    });
  });
  
  describe('Session deletion', () => {
    test('should delete session', async () => {
      const session = await manager.createSession();
      
      const deleted = await manager.delete(session.id);
      expect(deleted).toBe(true);
      
      const loaded = await manager.getSession(session.id);
      expect(loaded).toBeNull();
    });
    
    test('should clear current session when deleted', async () => {
      const session = await manager.createSession();
      
      await manager.delete(session.id);
      
      const current = manager.getCurrentSession();
      expect(current).toBeNull();
    });
  });
  
  describe('Clear operations', () => {
    test('should clear all sessions', async () => {
      await manager.createSession();
      await manager.createSession();
      
      await manager.clear();
      
      const sessions = await manager.list();
      expect(sessions).toHaveLength(0);
      
      const current = manager.getCurrentSession();
      expect(current).toBeNull();
    });
  });
  
  describe('Session count by state', () => {
    test('should get session count by state', async () => {
      const session1 = await manager.createSession();
      await manager.createSession();
      const session3 = await manager.createSession();
      
      await manager.endSession(session1.id);
      await manager.archive(session3.id);
      
      const counts = await manager.getSessionCountByState();
      
      expect(counts.active).toBeGreaterThanOrEqual(1);
      expect(counts.completed).toBeGreaterThanOrEqual(1);
      expect(counts.archived).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('Recent sessions', () => {
    test('should get recent sessions', async () => {
      await manager.createSession();
      await manager.createSession();
      await manager.createSession();
      
      const recent = await manager.getRecentSessions(2);
      expect(recent).toHaveLength(2);
    });
  });
  
  describe('Session cache', () => {
    test('should cache loaded sessions', async () => {
      const session = await manager.createSession();
      
      // Load session
      await manager.getSession(session.id);
      
      // Should be served from cache (no database hit)
      const cached = await manager.getSession(session.id);
      expect(cached?.id).toBe(session.id);
    });
  });
});
