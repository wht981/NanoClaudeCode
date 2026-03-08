/**
 * Agent interfaces for role-based AI assistants
 */

import type { LLMProvider } from './llm';
import type { Tool } from './tool';
import type { Message } from './message';

/**
 * Agent capability flags
 */
export interface AgentCapabilities {
  canExecuteTools: boolean;
  canStreamResponses: boolean;
  canAccessFiles: boolean;
  canAccessNetwork: boolean;
  canModifySystem: boolean;
  maxContextTokens: number;
}

/**
 * Agent role definition
 */
export type AgentRole = 
  | 'assistant'    // General purpose assistant
  | 'coder'        // Code generation and editing
  | 'reviewer'     // Code review and analysis
  | 'debugger'     // Debugging and troubleshooting
  | 'architect'    // System design and architecture
  | 'tester'       // Test generation and execution
  | 'documenter'   // Documentation generation
  | 'custom';      // Custom role

/**
 * Agent state
 */
export type AgentState = 
  | 'idle' 
  | 'thinking' 
  | 'executing' 
  | 'waiting' 
  | 'error';

/**
 * Agent execution context
 */
export interface AgentContext {
  sessionId: string;
  workingDirectory: string;
  environmentVariables: Record<string, string>;
  metadata: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: AgentCapabilities;
  llmProvider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[]; // Tool names
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent interface
 */
export interface Agent {
  readonly id: string;
  readonly config: AgentConfig;
  readonly state: AgentState;
  readonly capabilities: AgentCapabilities;

  /**
   * Initialize the agent
   */
  initialize(
    llmProvider: LLMProvider,
    tools: Tool[],
    context: AgentContext
  ): Promise<void>;

  /**
   * Execute a task
   */
  execute(
    input: string,
    options?: {
      streaming?: boolean;
      maxIterations?: number;
      contextMessages?: Message[];
    }
  ): Promise<AgentResult>;

  /**
   * Stream a task execution
   */
  executeStream(
    input: string,
    options?: {
      maxIterations?: number;
      contextMessages?: Message[];
    }
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }>;

  /**
   * Cleanup and dispose resources
   */
  dispose(): Promise<void>;

  /**
   * Get current state
   */
  getState(): AgentState;

  /**
   * Reset agent to initial state
   */
  reset(): Promise<void>;
}

/**
 * Agent factory for creating agents
 */
export interface AgentFactory {
  /**
   * Create an agent from config
   */
  createAgent(config: AgentConfig): Promise<Agent>;

  /**
   * Get available agent roles
   */
  getAvailableRoles(): AgentRole[];
}
