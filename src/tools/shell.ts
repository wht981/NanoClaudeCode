/**
 * Shell execution tool for running commands
 */
import { BaseTool } from './base';
import type { ToolResult, JSONSchema } from '../types/tool';

export interface ShellToolConfig {
  /**
   * Default timeout in milliseconds (default: 30000)
   */
  defaultTimeout?: number;
  
  /**
   * Working directory for command execution
   */
  cwd?: string;
  
  /**
   * Enable restricted mode with command whitelisting
   */
  restrictedMode?: boolean;
  
  /**
   * Allowed commands in restricted mode (command prefixes)
   */
  allowedCommands?: string[];
}

export interface ShellToolArgs {
  /**
   * Command to execute
   */
  command: string;
  
  /**
   * Working directory (overrides config)
   */
  cwd?: string;
  
  /**
   * Timeout in milliseconds (overrides config)
   */
  timeout?: number;
  
  /**
   * Environment variables
   */
  env?: Record<string, string>;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  executionTime: number;
}

/**
 * Shell tool for executing system commands with timeout and validation
 */
export class ShellTool extends BaseTool {
  private config: Required<ShellToolConfig>;
  
  // Dangerous command patterns that should be blocked
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,           // rm -rf /
    /:\(\)\{.*\}:/,            // Fork bombs
    /mkfs\./,                  // Format filesystem
    /dd\s+if=/,                // Disk operations
    />\/dev\/sd/,              // Writing to block devices
    /wget.*\|.*sh/,            // Download and execute
    /curl.*\|.*sh/,            // Download and execute
  ];

  constructor(config: ShellToolConfig = {}) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute',
          minLength: 1,
        },
        cwd: {
          type: 'string',
          description: 'Working directory for command execution',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds',
          minimum: 100,
          maximum: 300000, // 5 minutes max
        },
        env: {
          type: 'object',
          description: 'Environment variables',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['command'],
      additionalProperties: false,
    };

    super(
      'shell',
      'Execute shell commands with timeout and security validation',
      schema
    );

    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      cwd: config.cwd ?? process.cwd(),
      restrictedMode: config.restrictedMode ?? false,
      allowedCommands: config.allowedCommands ?? [],
    };
  }

  /**
   * Execute a shell command
   */
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // Validate arguments
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(`Invalid arguments: ${validation.errors?.join(', ')}`);
    }

    const shellArgs = args as unknown as ShellToolArgs;
    
    // Validate command security
    const securityCheck = this.validateCommand(shellArgs.command);
    if (!securityCheck.safe) {
      return this.error(`Command blocked: ${securityCheck.reason}`);
    }

    // Execute command
    try {
      const output = await this.executeCommand(
        shellArgs.command,
        {
          cwd: shellArgs.cwd ?? this.config.cwd,
          timeout: shellArgs.timeout ?? this.config.defaultTimeout,
          env: shellArgs.env,
        }
      );

      return this.success(
        this.formatOutput(output),
        {
          exitCode: output.exitCode,
          timedOut: output.timedOut,
          executionTime: output.executionTime,
        }
      );
    } catch (error) {
      return this.error(
        `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate command for security issues
   */
  private validateCommand(command: string): { safe: boolean; reason?: string } {
    // Check for dangerous patterns
    for (const pattern of ShellTool.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: `Command matches dangerous pattern: ${pattern}`,
        };
      }
    }

    // Check restricted mode whitelist
    if (this.config.restrictedMode) {
      const commandName = command.trim().split(/\s+/)[0] ?? '';
      const isAllowed = this.config.allowedCommands.some(
        allowed => commandName === allowed || commandName.startsWith(allowed + ' ')
      );

      if (!isAllowed) {
        return {
          safe: false,
          reason: `Command '${commandName}' not in whitelist. Allowed: ${this.config.allowedCommands.join(', ')}`,
        };
      }
    }

    return { safe: true };
  }

  /**
   * Execute command using Bun's spawn
   */
  private async executeCommand(
    command: string,
    options: {
      cwd: string;
      timeout: number;
      env?: Record<string, string>;
    }
  ): Promise<ShellOutput> {
    const startTime = Date.now();
    let timedOut = false;

    // Prepare environment
    const env = {
      ...process.env,
      ...options.env,
    };

    // Determine shell based on platform
    let shellCmd: string[];
    if (process.platform === 'win32') {
      // Windows: use cmd.exe
      shellCmd = ['cmd', '/c', command];
    } else {
      // Unix: use sh
      shellCmd = ['sh', '-c', command];
    }

    try {
      // Use Bun.spawn for command execution
      const proc = Bun.spawn(shellCmd, {
        cwd: options.cwd,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Wait for process with timeout
      const result = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            proc.kill();
            reject(new Error('Command timed out'));
          }, options.timeout);
        }),
      ]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = proc.exitCode ?? 0;

      return {
        stdout,
        stderr,
        exitCode,
        timedOut: false,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      if (timedOut || (error instanceof Error && error.message.includes('timed out'))) {
        return {
          stdout: '',
          stderr: 'Command execution timed out',
          exitCode: -1,
          timedOut: true,
          executionTime: options.timeout,
        };
      }

      throw error;
    }
  }


  /**
   * Format shell output for display
   */
  private formatOutput(output: ShellOutput): string {
    const parts: string[] = [];

    if (output.stdout.trim()) {
      parts.push(output.stdout.trim());
    }

    if (output.stderr.trim()) {
      parts.push(`STDERR: ${output.stderr.trim()}`);
    }

    if (parts.length === 0) {
      parts.push(output.exitCode === 0 ? '(no output)' : `Command failed with exit code ${output.exitCode}`);
    }

    if (output.timedOut) {
      parts.push('[TIMED OUT]');
    }

    return parts.join('\n');
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<ShellToolConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ShellToolConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
