/**
 * Tool and JSON Schema types for function calling
 */

/**
 * JSON Schema type definitions for tool parameters
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

export interface JSONSchemaProperty {
  type?: JSONSchemaType | JSONSchemaType[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  $ref?: string;
  oneOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  allOf?: JSONSchemaProperty[];
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  $schema?: string;
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  name: string;
  type: JSONSchemaType;
  description: string;
  required: boolean;
  schema?: JSONSchemaProperty;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool interface
 */
export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  
  /**
   * Execute the tool with given arguments
   */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
  
  /**
   * Validate arguments against schema
   */
  validateArgs(args: Record<string, unknown>): { valid: boolean; errors?: string[] };
}

/**
 * Tool registry for managing available tools
 */
export interface ToolRegistry {
  /**
   * Register a new tool
   */
  register(tool: Tool): void;
  
  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined;
  
  /**
   * Get all registered tools
   */
  getAll(): Tool[];
  
  /**
   * Check if a tool exists
   */
  has(name: string): boolean;
  
  /**
   * Unregister a tool
   */
  unregister(name: string): boolean;
}
