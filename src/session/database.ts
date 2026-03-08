/**
 * Database layer for session persistence using bun:sqlite
 */

import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import type { Session, SessionState, SessionMetadata, SessionStatistics } from '../types/session';
import type { Message } from '../types/message';

export interface DatabaseOptions {
  /**
   * Database file path. Use ':memory:' for in-memory database.
   */
  path: string;
  
  /**
   * Enable verbose logging
   */
  verbose?: boolean;
  
  /**
   * Enable Write-Ahead Logging for better concurrency
   */
  enableWAL?: boolean;
}

/**
 * SQLite database wrapper for session storage
 */
export class SessionDatabase {
  private db: Database;
  private readonly CURRENT_VERSION = 1;
  
  constructor(options: DatabaseOptions) {
    this.db = new Database(options.path);
    
    if (options.verbose) {
      // Bun's sqlite doesn't have verbose option
    }
    
    if (options.enableWAL) {
      this.db.run('PRAGMA journal_mode = WAL');
    }
    
    this.initialize();
  }
  
  /**
   * Initialize database schema and migrations
   */
  private initialize(): void {
    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');
    
    // Create schema version table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
    
    const currentVersion = this.getCurrentVersion();
    
    if (currentVersion < this.CURRENT_VERSION) {
      this.runMigrations(currentVersion);
    }
  }
  
  /**
   * Get current schema version
   */
  private getCurrentVersion(): number {
    const row = this.db.query('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
    return row.version ?? 0;
  }
  
  /**
   * Run database migrations
   */
  private runMigrations(fromVersion: number): void {
    const migrations = [
      this.migration_v1.bind(this),
    ];
    
    for (let version = fromVersion; version < this.CURRENT_VERSION; version++) {
      const migration = migrations[version];
      if (migration) {
        console.log(`Running migration to version ${version + 1}...`);
        migration();
        this.db.query('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version + 1, Date.now());
      }
    }
  }
  
  /**
   * Migration v1: Create initial schema
   */
  private migration_v1(): void {
    this.db.run(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK(state IN ('active', 'paused', 'completed', 'error', 'archived')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        tags TEXT, -- JSON array
        agent_role TEXT,
        model TEXT,
        total_tokens INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        agent_config TEXT, -- JSON
        context_variables TEXT -- JSON
      );
      
      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
        content TEXT NOT NULL, -- JSON
        name TEXT,
        tool_calls TEXT, -- JSON array
        tool_call_id TEXT,
        timestamp INTEGER NOT NULL,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        finish_reason TEXT,
        execution_time INTEGER,
        metadata TEXT, -- JSON
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);
  }
  
  /**
   * Save a session to the database
   */
  saveSession(session: Session): void {
    const stmt = this.db.query(`
      INSERT OR REPLACE INTO sessions (
        id, state, created_at, updated_at, title, description, tags,
        agent_role, model, total_tokens, total_messages, agent_config, context_variables
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      session.id,
      session.state,
      session.metadata.createdAt,
      session.metadata.updatedAt,
      session.metadata.title ?? null,
      session.metadata.description ?? null,
      session.metadata.tags ? JSON.stringify(session.metadata.tags) : null,
      session.metadata.agentRole ?? null,
      session.metadata.model ?? null,
      session.metadata.totalTokens ?? 0,
      session.metadata.totalMessages ?? 0,
      session.agentConfig ? JSON.stringify(session.agentConfig) : null,
      session.contextVariables ? JSON.stringify(session.contextVariables) : null
    );
  }
  
  /**
   * Load a session from the database
   */
  loadSession(sessionId: string): Session | null {
    const row = this.db.query(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId) as any;
    
    if (!row) {
      return null;
    }
    
    // Load messages
    const messages = this.loadMessages(sessionId);
    
    return this.rowToSession(row, messages);
  }
  
  /**
   * Delete a session and its messages
   */
  deleteSession(sessionId: string): boolean {
    const result = this.db.query('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return result.changes > 0;
  }
  
  /**
   * List sessions with optional filtering
   */
  listSessions(options?: {
    limit?: number;
    offset?: number;
    state?: SessionState;
    tags?: string[];
  }): Session[] {
    let query = 'SELECT * FROM sessions';
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (options?.state) {
      conditions.push('state = ?');
      params.push(options.state);
    }
    
    if (options?.tags && options.tags.length > 0) {
      // Search for tags in JSON array
      for (const tag of options.tags) {
        conditions.push("tags LIKE ?");
        params.push(`%"${tag}"%`);
      }
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY updated_at DESC';
    
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
    
    const rows = this.db.query(query).all(...params) as any[];
    
    return rows.map(row => {
      const messages = this.loadMessages(row.id);
      return this.rowToSession(row, messages);
    });
  }
  
  /**
   * Save a message to the database
   */
  saveMessage(sessionId: string, message: Message): void {
    const stmt = this.db.query(`
      INSERT OR REPLACE INTO messages (
        id, session_id, role, content, name, tool_calls, tool_call_id,
        timestamp, model, prompt_tokens, completion_tokens, total_tokens,
        finish_reason, execution_time, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const metadata = message.metadata;
    
    stmt.run(
      message.id ?? randomUUID(),
      sessionId,
      message.role,
      JSON.stringify(message.content),
      message.name ?? null,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.toolCallId ?? null,
      metadata?.timestamp ?? Date.now(),
      metadata?.model ?? null,
      metadata?.usage?.promptTokens ?? null,
      metadata?.usage?.completionTokens ?? null,
      metadata?.usage?.totalTokens ?? null,
      metadata?.finishReason ?? null,
      metadata?.executionTime ?? null,
      metadata ? JSON.stringify(metadata) : null
    );
  }
  
  /**
   * Load messages for a session
   */
  loadMessages(sessionId: string): Message[] {
    const rows = this.db.query(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC
    `).all(sessionId) as any[];
    
    return rows.map(row => this.rowToMessage(row));
  }
  
  /**
   * Get session statistics
   */
  getStatistics(sessionId: string): SessionStatistics | null {
    const stats = this.db.query(`
      SELECT 
        COUNT(*) as message_count,
        SUM(CASE WHEN tool_calls IS NOT NULL THEN 1 ELSE 0 END) as tool_call_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(AVG(execution_time), 0) as avg_response_time,
        SUM(CASE WHEN role = 'assistant' AND finish_reason = 'error' THEN 1 ELSE 0 END) as error_count
      FROM messages WHERE session_id = ?
    `).get(sessionId) as any;
    
    if (!stats || stats.message_count === 0) {
      return null;
    }
    
    // Get duration from first to last message
    const durationRow = this.db.query(`
      SELECT 
        MAX(timestamp) - MIN(timestamp) as duration
      FROM messages WHERE session_id = ?
    `).get(sessionId) as any;
    
    return {
      messageCount: stats.message_count,
      toolCallCount: stats.tool_call_count,
      totalTokens: stats.total_tokens,
      promptTokens: stats.prompt_tokens,
      completionTokens: stats.completion_tokens,
      averageResponseTime: stats.avg_response_time,
      errorCount: stats.error_count,
      duration: durationRow?.duration ?? 0,
    };
  }
  
  /**
   * Archive a session (set state to archived)
   */
  archiveSession(sessionId: string): boolean {
    const result = this.db.query(`
      UPDATE sessions SET state = 'archived', updated_at = ? WHERE id = ?
    `).run(Date.now(), sessionId);
    
    return result.changes > 0;
  }
  
  /**
   * Update session metadata
   */
  updateMetadata(sessionId: string, metadata: Partial<SessionMetadata>): boolean {
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [Date.now()];
    
    if (metadata.title !== undefined) {
      updates.push('title = ?');
      params.push(metadata.title);
    }
    
    if (metadata.description !== undefined) {
      updates.push('description = ?');
      params.push(metadata.description);
    }
    
    if (metadata.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(metadata.tags));
    }
    
    if (metadata.agentRole !== undefined) {
      updates.push('agent_role = ?');
      params.push(metadata.agentRole);
    }
    
    if (metadata.model !== undefined) {
      updates.push('model = ?');
      params.push(metadata.model);
    }
    
    if (metadata.totalTokens !== undefined) {
      updates.push('total_tokens = ?');
      params.push(metadata.totalTokens);
    }
    
    if (metadata.totalMessages !== undefined) {
      updates.push('total_messages = ?');
      params.push(metadata.totalMessages);
    }
    
    params.push(sessionId);
    
    const result = this.db.query(`
      UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);
    
    return result.changes > 0;
  }
  
  /**
   * Update session state
   */
  updateState(sessionId: string, state: SessionState): boolean {
    const result = this.db.query(`
      UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?
    `).run(state, Date.now(), sessionId);
    
    return result.changes > 0;
  }
  
  /**
   * Clear all sessions and messages
   */
  clearAll(): void {
    this.db.run(`
      DELETE FROM messages;
      DELETE FROM sessions;
    `);
  }
  
  /**
   * Convert database row to Session object
   */
  private rowToSession(row: any, messages: Message[]): Session {
    const metadata: SessionMetadata = {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    
    if (row.title) metadata.title = row.title;
    if (row.description) metadata.description = row.description;
    if (row.tags) metadata.tags = JSON.parse(row.tags);
    if (row.agent_role) metadata.agentRole = row.agent_role;
    if (row.model) metadata.model = row.model;
    if (row.total_tokens) metadata.totalTokens = row.total_tokens;
    if (row.total_messages) metadata.totalMessages = row.total_messages;
    
    return {
      id: row.id,
      state: row.state as SessionState,
      messages,
      metadata,
      agentConfig: row.agent_config ? JSON.parse(row.agent_config) : undefined,
      contextVariables: row.context_variables ? JSON.parse(row.context_variables) : undefined,
    };
  }
  
  /**
   * Convert database row to Message object
   */
  private rowToMessage(row: any): Message {
    const message: Message = {
      id: row.id,
      role: row.role,
      content: JSON.parse(row.content),
    };
    
    if (row.name) message.name = row.name;
    if (row.tool_calls) message.toolCalls = JSON.parse(row.tool_calls);
    if (row.tool_call_id) message.toolCallId = row.tool_call_id;
    
    if (row.timestamp || row.model || row.total_tokens) {
      message.metadata = {
        timestamp: row.timestamp,
      };
      
      if (row.model) message.metadata.model = row.model;
      if (row.total_tokens) {
        message.metadata.usage = {
          promptTokens: row.prompt_tokens ?? 0,
          completionTokens: row.completion_tokens ?? 0,
          totalTokens: row.total_tokens,
        };
      }
      if (row.finish_reason) message.metadata.finishReason = row.finish_reason;
      if (row.execution_time) message.metadata.executionTime = row.execution_time;
    }
    
    return message;
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
  
  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }
}
