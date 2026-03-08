/**
 * SQLite-based session storage implementation
 */

import Database from 'better-sqlite3';
import type {
  Session,
  SessionStorage,
  SessionState,
  SessionMetadata,
  SessionStatistics,
} from '../types/session';
import type { Message, MessageMetadata } from '../types/message';
import { initializeSchema, createTables } from './schema';

/**
 * Storage configuration options
 */
export interface StorageOptions {
  /**
   * Path to the database file
   * Use ':memory:' for in-memory database
   */
  dbPath: string;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  /**
   * Enable WAL mode for better concurrency
   */
  enableWAL?: boolean;
}

/**
 * SQLite-based session storage
 */
export class SQLiteSessionStorage implements SessionStorage {
  private db: Database.Database;

  constructor(options: StorageOptions) {
    this.db = new Database(options.dbPath, {
      verbose: options.verbose ? console.log : undefined,
    });

    // Enable WAL mode for better concurrency (except for in-memory DBs)
    if (options.enableWAL !== false && options.dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema(this.db);
  }

  /**
   * Save session to storage
   */
  async save(session: Session): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Upsert session
      this.db.prepare(`
        INSERT OR REPLACE INTO sessions (
          id, state, created_at, updated_at, title, description, 
          agent_role, model, total_tokens, total_messages,
          agent_config, context_variables
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.state,
        session.metadata.createdAt,
        session.metadata.updatedAt,
        session.metadata.title || null,
        session.metadata.description || null,
        session.metadata.agentRole || null,
        session.metadata.model || null,
        session.metadata.totalTokens || 0,
        session.metadata.totalMessages || 0,
        session.agentConfig ? JSON.stringify(session.agentConfig) : null,
        session.contextVariables ? JSON.stringify(session.contextVariables) : null
      );

      // Handle tags
      if (session.metadata.tags && session.metadata.tags.length > 0) {
        // Clear existing tags
        this.db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(session.id);
        
        // Insert new tags
        const insertTag = this.db.prepare('INSERT INTO session_tags (session_id, tag) VALUES (?, ?)');
        for (const tag of session.metadata.tags) {
          insertTag.run(session.id, tag);
        }
      }

      // Handle additional metadata
      const standardKeys = ['createdAt', 'updatedAt', 'title', 'description', 'tags', 'agentRole', 'model', 'totalTokens', 'totalMessages'];
      const additionalMetadata = Object.entries(session.metadata).filter(
        ([key]) => !standardKeys.includes(key)
      );

      if (additionalMetadata.length > 0) {
        // Clear existing metadata
        this.db.prepare('DELETE FROM session_metadata WHERE session_id = ?').run(session.id);
        
        // Insert new metadata
        const insertMetadata = this.db.prepare('INSERT INTO session_metadata (session_id, key, value) VALUES (?, ?, ?)');
        for (const [key, value] of additionalMetadata) {
          insertMetadata.run(session.id, key, JSON.stringify(value));
        }
      }

      // Save messages
      if (session.messages && session.messages.length > 0) {
        const insertMessage = this.db.prepare(`
          INSERT OR REPLACE INTO messages (
            id, session_id, role, content, name, tool_calls, tool_call_id,
            timestamp, model, prompt_tokens, completion_tokens, total_tokens,
            finish_reason, execution_time, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const message of session.messages) {
          const metadata = message.metadata;
          insertMessage.run(
            message.id,
            session.id,
            message.role,
            JSON.stringify(message.content),
            message.name || null,
            message.toolCalls ? JSON.stringify(message.toolCalls) : null,
            message.toolCallId || null,
            metadata?.timestamp || Date.now(),
            metadata?.model || null,
            metadata?.usage?.promptTokens || null,
            metadata?.usage?.completionTokens || null,
            metadata?.usage?.totalTokens || null,
            metadata?.finishReason || null,
            metadata?.executionTime || null,
            metadata ? JSON.stringify(metadata) : null
          );
        }
      }
    });

    transaction();
  }

  /**
   * Load session from storage
   */
  async load(sessionId: string): Promise<Session | null> {
    // Load session data
    const sessionRow = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId) as any;

    if (!sessionRow) {
      return null;
    }

    // Load tags
    const tags = this.db.prepare('SELECT tag FROM session_tags WHERE session_id = ?')
      .all(sessionId)
      .map((row: any) => row.tag);

    // Load additional metadata
    const metadataRows = this.db.prepare('SELECT key, value FROM session_metadata WHERE session_id = ?')
      .all(sessionId) as any[];
    
    const additionalMetadata: Record<string, unknown> = {};
    for (const row of metadataRows) {
      try {
        additionalMetadata[row.key] = JSON.parse(row.value);
      } catch {
        additionalMetadata[row.key] = row.value;
      }
    }

    // Load messages
    const messageRows = this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC
    `).all(sessionId) as any[];

    const messages: Message[] = messageRows.map((row) => {
      const message: Message = {
        id: row.id,
        role: row.role,
        content: JSON.parse(row.content),
        name: row.name || undefined,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
        toolCallId: row.tool_call_id || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };

      return message;
    });

    // Construct session metadata
    const metadata: SessionMetadata = {
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
      title: sessionRow.title || undefined,
      description: sessionRow.description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      agentRole: sessionRow.agent_role || undefined,
      model: sessionRow.model || undefined,
      totalTokens: sessionRow.total_tokens || undefined,
      totalMessages: sessionRow.total_messages || undefined,
      ...additionalMetadata,
    };

    // Construct session
    const session: Session = {
      id: sessionRow.id,
      state: sessionRow.state,
      messages,
      metadata,
      agentConfig: sessionRow.agent_config ? JSON.parse(sessionRow.agent_config) : undefined,
      contextVariables: sessionRow.context_variables ? JSON.parse(sessionRow.context_variables) : undefined,
    };

    return session;
  }

  /**
   * Delete session from storage
   */
  async delete(sessionId: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return result.changes > 0;
  }

  /**
   * List all sessions
   */
  async list(options?: {
    limit?: number;
    offset?: number;
    state?: SessionState;
    tags?: string[];
  }): Promise<Session[]> {
    let query = 'SELECT DISTINCT s.id FROM sessions s';
    const params: any[] = [];

    // Handle tag filtering
    if (options?.tags && options.tags.length > 0) {
      query += ' INNER JOIN session_tags st ON s.id = st.session_id';
      query += ' WHERE st.tag IN (' + options.tags.map(() => '?').join(',') + ')';
      params.push(...options.tags);
    }

    // Handle state filtering
    if (options?.state) {
      query += options?.tags ? ' AND' : ' WHERE';
      query += ' s.state = ?';
      params.push(options.state);
    }

    // Order and pagination
    query += ' ORDER BY s.updated_at DESC';
    
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    
    // Load each session
    const sessions: Session[] = [];
    for (const row of rows) {
      const session = await this.load(row.id);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get session statistics
   */
  async getStatistics(sessionId: string): Promise<SessionStatistics | null> {
    const session = await this.load(sessionId);
    if (!session) {
      return null;
    }

    const messageStats = this.db.prepare(`
      SELECT 
        COUNT(*) as message_count,
        SUM(CASE WHEN tool_calls IS NOT NULL THEN 1 ELSE 0 END) as tool_call_count,
        SUM(COALESCE(total_tokens, 0)) as total_tokens,
        SUM(COALESCE(prompt_tokens, 0)) as prompt_tokens,
        SUM(COALESCE(completion_tokens, 0)) as completion_tokens,
        AVG(COALESCE(execution_time, 0)) as avg_response_time,
        SUM(CASE WHEN finish_reason = 'error' THEN 1 ELSE 0 END) as error_count
      FROM messages WHERE session_id = ?
    `).get(sessionId) as any;

    // Calculate duration
    const timestamps = this.db.prepare(
      'SELECT MIN(timestamp) as first, MAX(timestamp) as last FROM messages WHERE session_id = ?'
    ).get(sessionId) as any;

    const duration = timestamps.first && timestamps.last
      ? timestamps.last - timestamps.first
      : 0;

    return {
      messageCount: messageStats.message_count || 0,
      toolCallCount: messageStats.tool_call_count || 0,
      totalTokens: messageStats.total_tokens || 0,
      promptTokens: messageStats.prompt_tokens || 0,
      completionTokens: messageStats.completion_tokens || 0,
      averageResponseTime: messageStats.avg_response_time || 0,
      errorCount: messageStats.error_count || 0,
      duration,
    };
  }

  /**
   * Archive session
   */
  async archive(sessionId: string): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE sessions SET state = 'archived', updated_at = ? WHERE id = ?
    `).run(Date.now(), sessionId);

    return result.changes > 0;
  }

  /**
   * Clear all sessions
   */
  async clear(): Promise<void> {
    this.db.prepare('DELETE FROM sessions').run();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying database instance (for testing)
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}
