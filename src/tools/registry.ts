/**
 * Tool registry for managing and discovering tools
 */
import type { Tool, ToolRegistry as IToolRegistry } from '../types/tool';

export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a new tool
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   * @returns true if tool was removed, false if it didn't exist
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get the count of registered tools
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * Get tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Register multiple tools at once
   * @throws Error if any tool name conflicts
   */
  registerMany(tools: Tool[]): void {
    // First check for conflicts
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool '${tool.name}' is already registered`);
      }
    }

    // Then register all
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Find tools matching a predicate
   */
  find(predicate: (tool: Tool) => boolean): Tool[] {
    return Array.from(this.tools.values()).filter(predicate);
  }

  /**
   * Get tools by name pattern (supports wildcards)
   */
  search(pattern: string): Tool[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return this.find(tool => regex.test(tool.name));
  }
}
