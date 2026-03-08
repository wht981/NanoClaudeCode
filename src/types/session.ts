/**
 * Session types for persistence and state management
 */

import type { Message } from './message';
import type { AgentConfig } from './agent';

/**
 * Session state
 */
export type SessionState = 
  | 'active' 
  | 'paused' 
  | 'completed' 
  | 'error' 
  | 'archived';

/**
 * Session metadata
 */
export interface SessionMetadata {
  createdAt: number;
  updatedAt: number;
  title?: string;
  description?: string;
  tags?: string[];
  agentRole?: string;
  model?: string;
  totalTokens?: number;
  totalMessages?: number;
  [key: string]: unknown;
}

/**
 * Session statistics
 */
export interface SessionStatistics {
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  averageResponseTime: number;
  errorCount: number;
  duration: number; // milliseconds
}

/**
 * Session interface
 */
export interface Session {
  id: string;
  state: SessionState;
  messages: Message[];
  metadata: SessionMetadata;
  agentConfig?: AgentConfig;
  contextVariables?: Record<string, unknown>;
}

/**
 * Session storage interface
 */
export interface SessionStorage {
  /**
   * Save session to storage
   */
  save(session: Session): Promise<void>;

  /**
   * Load session from storage
   */
  load(sessionId: string): Promise<Session | null>;

  /**
   * Delete session from storage
   */
  delete(sessionId: string): Promise<boolean>;

  /**
   * List all sessions
   */
  list(options?: {
    limit?: number;
    offset?: number;
    state?: SessionState;
    tags?: string[];
  }): Promise<Session[]>;

  /**
   * Get session statistics
   */
  getStatistics(sessionId: string): Promise<SessionStatistics | null>;

  /**
   * Archive session
   */
  archive(sessionId: string): Promise<boolean>;

  /**
   * Clear all sessions
   */
  clear(): Promise<void>;
}

/**
 * Session manager for active session handling
 */
export interface SessionManager {
  /**
   * Create new session
   */
  createSession(agentConfig?: AgentConfig): Promise<Session>;

  /**
   * Get current active session
   */
  getCurrentSession(): Session | null;

  /**
   * Set active session
   */
  setCurrentSession(sessionId: string): Promise<boolean>;

  /**
   * Add message to session
   */
  addMessage(sessionId: string, message: Message): Promise<void>;

  /**
   * Update session metadata
   */
  updateMetadata(sessionId: string, metadata: Partial<SessionMetadata>): Promise<void>;

  /**
   * End session
   */
  endSession(sessionId: string): Promise<void>;

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Promise<Session | null>;
}
