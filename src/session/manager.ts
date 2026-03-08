/**
 * Session manager for active session handling and persistence
 */

import { randomUUID } from 'crypto';
import type {
  Session,
  SessionState,
  SessionMetadata,
  SessionStatistics,
  SessionStorage,
  SessionManager as ISessionManager,
} from '../types/session';
import type { Message } from '../types/message';
import type { AgentConfig } from '../types/agent';
import { SessionDatabase, type DatabaseOptions } from './database';

/**
 * Session manager configuration
 */
export interface SessionManagerOptions {
  /**
   * Database options
   */
  database: DatabaseOptions;
  
  /**
   * Auto-save interval in milliseconds (0 to disable)
   */
  autoSaveInterval?: number;
  
  /**
   * Maximum sessions to keep in cache
   */
  maxCacheSessions?: number;
}

/**
 * Session manager implementation with SQLite persistence
 */
export class SessionManager implements ISessionManager, SessionStorage {
  private db: SessionDatabase;
  private currentSession: Session | null = null;
  private sessionCache: Map<string, Session> = new Map();
  private autoSaveTimer?: Timer;
  private readonly options: Required<SessionManagerOptions>;
  
  constructor(options: SessionManagerOptions) {
    this.options = {
      database: options.database,
      autoSaveInterval: options.autoSaveInterval ?? 5000,
      maxCacheSessions: options.maxCacheSessions ?? 10,
    };
    
    this.db = new SessionDatabase(this.options.database);
    
    if (this.options.autoSaveInterval > 0) {
      this.startAutoSave();
    }
  }
  
  /**
   * Create a new session
   */
  async createSession(agentConfig?: AgentConfig): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      state: 'active',
      messages: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        totalTokens: 0,
        totalMessages: 0,
      },
      agentConfig,
      contextVariables: {},
    };
    
    // Set title based on agent config
    if (agentConfig) {
      session.metadata.title = `${agentConfig.role} session`;
      session.metadata.agentRole = agentConfig.role;
      session.metadata.model = agentConfig.model;
    }
    
    // Save to database
    this.db.saveSession(session);
    
    // Add to cache
    this.addToCache(session);
    
    // Set as current session
    this.currentSession = session;
    
    return session;
  }
  
  /**
   * Get current active session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }
  
  /**
   * Set active session by ID
   */
  async setCurrentSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }
    
    this.currentSession = session;
    return true;
  }
  
  /**
   * Add message to session
   */
  async addMessage(sessionId: string, message: Message): Promise<void> {
    // Load session if not in cache
    let session = this.sessionCache.get(sessionId) ?? await this.load(sessionId);
    
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Add message to session
    session.messages.push(message);
    
    // Update metadata
    session.metadata.updatedAt = Date.now();
    session.metadata.totalMessages = session.messages.length;
    
    // Update token count if available
    if (message.metadata?.usage?.totalTokens) {
      session.metadata.totalTokens = (session.metadata.totalTokens ?? 0) + message.metadata.usage.totalTokens;
    }
    
    // Save message to database
    this.db.saveMessage(sessionId, message);
    
    // Update session metadata
    this.db.updateMetadata(sessionId, {
      updatedAt: session.metadata.updatedAt,
      totalMessages: session.metadata.totalMessages,
      totalTokens: session.metadata.totalTokens,
    });
    
    // Update cache
    this.addToCache(session);
  }
  
  /**
   * Update session metadata
   */
  async updateMetadata(sessionId: string, metadata: Partial<SessionMetadata>): Promise<void> {
    // Update in database
    const success = this.db.updateMetadata(sessionId, {
      ...metadata,
      updatedAt: Date.now(),
    });
    
    if (!success) {
      throw new Error(`Failed to update metadata for session: ${sessionId}`);
    }
    
    // Update cache if session is cached
    const cachedSession = this.sessionCache.get(sessionId);
    if (cachedSession) {
      Object.assign(cachedSession.metadata, metadata, { updatedAt: Date.now() });
    }
    
    // Update current session if it matches
    if (this.currentSession?.id === sessionId) {
      Object.assign(this.currentSession.metadata, metadata, { updatedAt: Date.now() });
    }
  }
  
  /**
   * End session (mark as completed)
   */
  async endSession(sessionId: string): Promise<void> {
    await this.updateSessionState(sessionId, 'completed');
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      return cached;
    }
    
    // Load from database
    return await this.load(sessionId);
  }
  
  /**
   * Save session to storage
   */
  async save(session: Session): Promise<void> {
    // Update timestamp
    session.metadata.updatedAt = Date.now();
    
    // Save to database
    this.db.saveSession(session);
    
    // Save messages (they may have been added in-memory)
    for (const message of session.messages) {
      this.db.saveMessage(session.id, message);
    }
    
    // Update cache
    this.addToCache(session);
  }
  
  /**
   * Load session from storage
   */
  async load(sessionId: string): Promise<Session | null> {
    const session = this.db.loadSession(sessionId);
    
    if (session) {
      this.addToCache(session);
    }
    
    return session;
  }
  
  /**
   * Delete session from storage
   */
  async delete(sessionId: string): Promise<boolean> {
    const success = this.db.deleteSession(sessionId);
    
    if (success) {
      // Remove from cache
      this.sessionCache.delete(sessionId);
      
      // Clear current session if it matches
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }
    }
    
    return success;
  }
  
  /**
   * List sessions with optional filters
   */
  async list(options?: {
    limit?: number;
    offset?: number;
    state?: SessionState;
    tags?: string[];
  }): Promise<Session[]> {
    return this.db.listSessions(options);
  }
  
  /**
   * Get session statistics
   */
  async getStatistics(sessionId: string): Promise<SessionStatistics | null> {
    return this.db.getStatistics(sessionId);
  }
  
  /**
   * Archive session
   */
  async archive(sessionId: string): Promise<boolean> {
    const success = this.db.archiveSession(sessionId);
    
    if (success) {
      // Update cache if present
      const cached = this.sessionCache.get(sessionId);
      if (cached) {
        cached.state = 'archived';
        cached.metadata.updatedAt = Date.now();
      }
      
      // Update current session if it matches
      if (this.currentSession?.id === sessionId) {
        this.currentSession.state = 'archived';
        this.currentSession.metadata.updatedAt = Date.now();
      }
    }
    
    return success;
  }
  
  /**
   * Clear all sessions
   */
  async clear(): Promise<void> {
    this.db.clearAll();
    this.sessionCache.clear();
    this.currentSession = null;
  }
  
  /**
   * Update session state
   */
  async updateSessionState(sessionId: string, state: SessionState): Promise<void> {
    const success = this.db.updateState(sessionId, state);
    
    if (!success) {
      throw new Error(`Failed to update state for session: ${sessionId}`);
    }
    
    // Update cache if present
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.state = state;
      cached.metadata.updatedAt = Date.now();
    }
    
    // Update current session if it matches
    if (this.currentSession?.id === sessionId) {
      this.currentSession.state = state;
      this.currentSession.metadata.updatedAt = Date.now();
    }
  }
  
  /**
   * Search sessions by title or description
   */
  async search(query: string, options?: {
    limit?: number;
    state?: SessionState;
  }): Promise<Session[]> {
    const allSessions = await this.list({
      limit: options?.limit,
      state: options?.state,
    });
    
    const lowerQuery = query.toLowerCase();
    
    return allSessions.filter(session => {
      const title = session.metadata.title?.toLowerCase() ?? '';
      const description = session.metadata.description?.toLowerCase() ?? '';
      return title.includes(lowerQuery) || description.includes(lowerQuery);
    });
  }
  
  /**
   * Get recent sessions
   */
  async getRecentSessions(limit = 10): Promise<Session[]> {
    return this.list({ limit, offset: 0 });
  }
  
  /**
   * Export session to JSON
   */
  async exportSession(sessionId: string): Promise<string> {
    const session = await this.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    return JSON.stringify(session, null, 2);
  }
  
  /**
   * Import session from JSON
   */
  async importSession(json: string): Promise<Session> {
    const session = JSON.parse(json) as Session;
    
    // Validate session structure
    if (!session.id || !session.state || !session.messages || !session.metadata) {
      throw new Error('Invalid session JSON structure');
    }
    
    // Save to database
    await this.save(session);
    
    return session;
  }
  
  /**
   * Clone an existing session
   */
  async cloneSession(sessionId: string, newTitle?: string): Promise<Session> {
    const original = await this.load(sessionId);
    if (!original) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const now = Date.now();
    const cloned: Session = {
      ...original,
      id: randomUUID(),
      metadata: {
        ...original.metadata,
        createdAt: now,
        updatedAt: now,
        title: newTitle ?? `${original.metadata.title} (copy)`,
      },
      messages: [...original.messages],
    };
    
    await this.save(cloned);
    
    return cloned;
  }
  
  /**
   * Get session count by state
   */
  async getSessionCountByState(): Promise<Record<SessionState, number>> {
    const states: SessionState[] = ['active', 'paused', 'completed', 'error', 'archived'];
    const counts: Record<SessionState, number> = {
      active: 0,
      paused: 0,
      completed: 0,
      error: 0,
      archived: 0,
    };
    
    for (const state of states) {
      const sessions = await this.list({ state });
      counts[state] = sessions.length;
    }
    
    return counts;
  }
  
  /**
   * Add session to cache
   */
  private addToCache(session: Session): void {
    // Check cache size limit
    if (this.sessionCache.size >= this.options.maxCacheSessions) {
      // Remove oldest session from cache
      const oldest = Array.from(this.sessionCache.entries())
        .sort((a, b) => a[1].metadata.updatedAt - b[1].metadata.updatedAt)[0];
      
      if (oldest) {
        this.sessionCache.delete(oldest[0]);
      }
    }
    
    this.sessionCache.set(session.id, session);
  }
  
  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      if (this.currentSession) {
        this.save(this.currentSession).catch(error => {
          console.error('Auto-save failed:', error);
        });
      }
    }, this.options.autoSaveInterval);
  }
  
  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }
  
  /**
   * Close and cleanup resources
   */
  async close(): Promise<void> {
    this.stopAutoSave();
    
    // Save current session if exists
    if (this.currentSession) {
      await this.save(this.currentSession);
    }
    
    // Close database
    this.db.close();
    
    // Clear cache
    this.sessionCache.clear();
    this.currentSession = null;
  }
}

/**
 * Create a session manager with default options
 */
export function createSessionManager(dbPath: string, options?: Partial<SessionManagerOptions>): SessionManager {
  return new SessionManager({
    database: {
      path: dbPath,
      enableWAL: true,
    },
    autoSaveInterval: options?.autoSaveInterval,
    maxCacheSessions: options?.maxCacheSessions,
  });
}
