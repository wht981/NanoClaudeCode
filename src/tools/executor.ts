/**
 * Tool execution engine with validation and error handling
 */
import type { Tool, ToolResult } from '../types/tool';
import { ToolRegistry } from './registry';
import { getAuditLogger, AuditEventType, AuditSeverity } from '../security/audit';

export interface ExecutionOptions {
  /**
   * Timeout for tool execution in milliseconds
   */
  timeout?: number;

  /**
   * Whether to validate arguments before execution
   */
  validate?: boolean;

  /**
   * Additional context to pass to the tool
   */
  context?: Record<string, unknown>;
}

export interface ExecutionResult extends ToolResult {
  /**
   * Name of the executed tool
   */
  toolName: string;

  /**
   * Execution duration in milliseconds
   */
  duration: number;

  /**
   * Whether validation was performed
   */
  validated: boolean;

  /**
   * Validation errors if any
   */
  validationErrors?: string[];
}

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  /**
   * Execute a tool by name with arguments
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { timeout = 30000, validate = true } = options;

    // Get tool from registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Tool '${toolName}' not found`,
        duration: Date.now() - startTime,
        validated: false,
      };
    }

    // Validate arguments if requested
    let validationErrors: string[] | undefined;
    if (validate) {
      const validation = tool.validateArgs(args);
      if (!validation.valid) {
        validationErrors = validation.errors;
        return {
          toolName,
          success: false,
          output: '',
          error: `Validation failed: ${validation.errors?.join(', ')}`,
          duration: Date.now() - startTime,
          validated: true,
          validationErrors,
        };
      }
    }

    // Execute tool with timeout
    try {
      const result = await this.executeWithTimeout(tool, args, timeout);
      const duration = Date.now() - startTime;

      // Audit logging: fire and forget
      const auditLogger = getAuditLogger();
      auditLogger.log(
        result.success ? AuditEventType.COMMAND_EXECUTED : AuditEventType.COMMAND_FAILED,
        `Tool '${toolName}' executed`,
        {
          severity: result.success ? AuditSeverity.INFO : AuditSeverity.WARNING,
          resource: toolName,
          metadata: {
            toolName,
            duration,
            success: result.success,
          },
          result: result.success ? 'success' : 'failure',
          error: result.error,
          duration,
        }
      ).catch(console.error);

      return {
        toolName,
        ...result,
        duration,
        validated: validate,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        toolName,
        success: false,
        output: '',
        error: `Execution error: ${errorMessage}`,
        duration: Date.now() - startTime,
        validated: validate,
      };
    }
  }

  /**
   * Execute multiple tools in sequence
   */
  async executeMany(
    executions: Array<{ toolName: string; args: Record<string, unknown> }>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const { toolName, args } of executions) {
      const result = await this.execute(toolName, args, options);
      results.push(result);

      // Stop on first error if configured
      if (!result.success && options.context?.stopOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(
    executions: Array<{ toolName: string; args: Record<string, unknown> }>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult[]> {
    const promises = executions.map(({ toolName, args }) =>
      this.execute(toolName, args, options)
    );

    return Promise.all(promises);
  }

  /**
   * Execute a tool with a timeout
   */
  private async executeWithTimeout(
    tool: Tool,
    args: Record<string, unknown>,
    timeout: number
  ): Promise<ToolResult> {
    return Promise.race([
      tool.execute(args),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timed out after ${timeout}ms`)), timeout)
      ),
    ]);
  }

  /**
   * Check if a tool can be executed (exists and has valid schema)
   */
  canExecute(toolName: string): boolean {
    const tool = this.registry.get(toolName);
    return tool !== undefined;
  }

  /**
   * Get execution info for a tool
   */
  getToolInfo(toolName: string): {
    exists: boolean;
    tool?: Tool;
    parameters?: string[];
    required?: string[];
  } {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { exists: false };
    }

    return {
      exists: true,
      tool,
      parameters: Object.keys(tool.parameters.properties),
      required: tool.parameters.required,
    };
  }

  /**
   * Dry-run validation without execution
   */
  validate(toolName: string, args: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
    tool?: Tool;
  } {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${toolName}' not found`],
      };
    }

    const validation = tool.validateArgs(args);
    return {
      ...validation,
      tool,
    };
  }
}
