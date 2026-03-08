/**
 * Configuration types for layered configuration system
 * Priority: CLI args > Environment variables > Config file > Defaults
 */

import type { AgentRole } from './agent';

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  name: 'anthropic' | 'openai' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  timeout?: number;
  maxRetries?: number;
  organization?: string;
}

/**
 * Logging configuration
 */
export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  format: 'json' | 'text' | 'pretty';
  output: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize?: number; // bytes
  maxFiles?: number;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  storageType: 'memory' | 'file' | 'sqlite' | 'custom';
  storagePath?: string;
  autoSave: boolean;
  autoSaveInterval?: number; // milliseconds
  maxSessions?: number;
  compressionEnabled?: boolean;
}

/**
 * Agent configuration
 */
export interface AgentDefaultConfig {
  defaultRole: AgentRole;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  timeoutMs: number;
  streamingEnabled: boolean;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  enabled: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  timeout?: number;
  maxConcurrency?: number;
}

/**
 * MCP configuration
 */
export interface MCPConfig {
  enabled: boolean;
  servers: MCPServerConfig[];
  timeout?: number;
  autoReconnect?: boolean;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  sandboxEnabled: boolean;
  allowFileAccess: boolean;
  allowedPaths?: string[];
  deniedPaths?: string[];
  allowNetworkAccess: boolean;
  allowedDomains?: string[];
  maxFileSize?: number; // bytes
  maxMemoryUsage?: number; // bytes
}

/**
 * UI configuration
 */
export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  editorIntegration: 'vscode' | 'cursor' | 'jetbrains' | 'none';
  showTokenUsage: boolean;
  showTimings: boolean;
}

/**
 * Main configuration interface
 */
export interface Config {
  // Core settings
  llmProvider: LLMProviderConfig;
  agent: AgentDefaultConfig;
  
  // Feature settings
  session: SessionConfig;
  tools: ToolConfig;
  mcp: MCPConfig;
  security: SecurityConfig;
  
  // System settings
  logging: LogConfig;
  ui: UIConfig;
  
  // Workspace settings
  workspaceRoot?: string;
  gitEnabled?: boolean;
  
  // Custom settings
  custom?: Record<string, unknown>;
}

/**
 * Configuration source
 */
export type ConfigSource = 
  | 'default'
  | 'file'
  | 'environment'
  | 'cli';

/**
 * Configuration layer
 */
export interface ConfigLayer {
  source: ConfigSource;
  config: Partial<Config>;
  priority: number;
}

/**
 * Configuration manager
 */
export interface ConfigManager {
  /**
   * Load configuration from all sources
   */
  load(): Promise<Config>;

  /**
   * Get current configuration
   */
  get(): Config;

  /**
   * Get specific configuration value
   */
  getValue<T>(path: string): T | undefined;

  /**
   * Update configuration
   */
  update(path: string, value: unknown): Promise<void>;

  /**
   * Save configuration to file
   */
  save(): Promise<void>;

  /**
   * Reload configuration
   */
  reload(): Promise<Config>;

  /**
   * Get configuration layers
   */
  getLayers(): ConfigLayer[];

  /**
   * Validate configuration
   */
  validate(config: Partial<Config>): { valid: boolean; errors?: string[] };
}
