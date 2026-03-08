/**
 * Database schema and migrations for session persistence
 */

import type Database from 'better-sqlite3';

/**
 * Database schema version
 */
export const SCHEMA_VERSION = 1;

/**
 * Create database tables
 */
export function createTables(db: Database.Database): void {
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK(state IN ('active', 'paused', 'completed', 'error', 'archived')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT,
      description TEXT,
      agent_role TEXT,
      model TEXT,
      total_tokens INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      agent_config TEXT,
      context_variables TEXT
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      name TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      timestamp INTEGER NOT NULL,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      finish_reason TEXT,
      execution_time INTEGER,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Session tags table (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (session_id, tag),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Session metadata table (key-value pairs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (session_id, key),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag);
  `);

  // Schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

/**
 * Initialize database schema
 */
export function initializeSchema(db: Database.Database): void {
  // Check current schema version
  const versionRow = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    // Apply migrations
    applyMigrations(db, currentVersion, SCHEMA_VERSION);
    
    // Update schema version
    db.prepare('INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      SCHEMA_VERSION,
      Date.now()
    );
  }
}

/**
 * Apply database migrations
 */
function applyMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  if (fromVersion === 0) {
    // Initial schema creation
    createTables(db);
  }

  // Add future migrations here
  // if (fromVersion < 2) {
  //   db.exec('ALTER TABLE sessions ADD COLUMN new_field TEXT');
  // }
}

/**
 * Drop all tables (use with caution)
 */
export function dropTables(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS session_metadata;
    DROP TABLE IF EXISTS session_tags;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS schema_version;
  `);
}

/**
 * Get database statistics
 */
export function getDatabaseStats(db: Database.Database): {
  sessionCount: number;
  messageCount: number;
  totalSize: number;
} {
  const sessionCount = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
  const messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
  const totalSize = (db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number }).size;

  return {
    sessionCount,
    messageCount,
    totalSize,
  };
}
