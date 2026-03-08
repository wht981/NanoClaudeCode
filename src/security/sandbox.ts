/**
 * Sandbox for command execution
 * Provides isolated execution environment with restrictions and monitoring
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { RiskLevel, requestConfirmation } from "./confirmation.js";

export interface SandboxConfig {
	/** Maximum execution time in milliseconds */
	timeout?: number;
	/** Working directory (defaults to cwd) */
	cwd?: string;
	/** Environment variables (starts with clean env if not specified) */
	env?: Record<string, string>;
	/** Whether to allow network access */
	allowNetwork?: boolean;
	/** Allowed file paths (read/write restrictions) */
	allowedPaths?: string[];
	/** Maximum memory usage in MB */
	maxMemory?: number;
	/** Whether to require confirmation before execution */
	requireConfirmation?: boolean;
}

export interface SandboxResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	duration: number;
	timedOut: boolean;
	signal?: string;
}

export class SandboxError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "SandboxError";
	}
}

/**
 * Default sandbox configuration
 */
const DEFAULT_CONFIG: Required<SandboxConfig> = {
	timeout: 30000, // 30 seconds
	cwd: process.cwd(),
	env: {},
	allowNetwork: false,
	allowedPaths: [],
	maxMemory: 512, // 512 MB
	requireConfirmation: true,
};

/**
 * Patterns for dangerous commands
 */
const DANGEROUS_PATTERNS = [
	/rm\s+-rf/i,
	/del\s+\/[sf]/i,
	/format\s+/i,
	/mkfs/i,
	/dd\s+if=/i,
	/:\(\)\{\s*:\|:&\s*\};:/i, // fork bomb
	/chmod\s+777/i,
	/wget.*\|.*sh/i,
	/curl.*\|.*sh/i,
	/>\/dev\/sd/i,
	/shutdown/i,
	/reboot/i,
	/poweroff/i,
];

/**
 * Check if a command contains dangerous patterns
 */
export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Determine risk level for a command
 */
export function assessCommandRisk(
	command: string,
	config: SandboxConfig,
): RiskLevel {
	// Check for dangerous patterns
	if (isDangerousCommand(command)) {
		return RiskLevel.CRITICAL;
	}

	// Commands with shell operators are higher risk
	if (/[|&;<>()$`\\]/.test(command)) {
		return RiskLevel.HIGH;
	}

	// Network-accessing commands without restriction
	if (
		!config.allowNetwork &&
		/\b(curl|wget|nc|telnet|ssh|ftp|http)\b/i.test(command)
	) {
		return RiskLevel.HIGH;
	}

	// File operations
	if (/\b(rm|del|mv|move|copy|cp)\b/i.test(command)) {
		return RiskLevel.MEDIUM;
	}

	return RiskLevel.LOW;
}

/**
 * Execute a command in a sandboxed environment
 */
export async function executeSandboxed(
	command: string,
	args: string[] = [],
	config: SandboxConfig = {},
): Promise<SandboxResult> {
	const fullConfig = { ...DEFAULT_CONFIG, ...config };
	const startTime = Date.now();

	// Assess risk and request confirmation if needed
	const riskLevel = assessCommandRisk(command, fullConfig);

	if (fullConfig.requireConfirmation && riskLevel !== RiskLevel.LOW) {
		const confirmation = await requestConfirmation({
			operation: "sandbox.execute",
			description: `Execute command: ${command} ${args.join(" ")}`,
			riskLevel,
			context: {
				command,
				args,
				workingDirectory: fullConfig.cwd,
			},
		});

		if (!confirmation.approved) {
			throw new SandboxError(
				"Command execution denied by user",
				"CONFIRMATION_DENIED",
				{ command, reason: confirmation.reason },
			);
		}
	}

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Prepare environment
		const env = {
			...fullConfig.env,
			// Remove potentially dangerous variables
			PATH: process.env.PATH || "",
		};

		// Spawn the process
		const child = spawn(command, args, {
			cwd: fullConfig.cwd,
			env,
			timeout: fullConfig.timeout,
			shell: false, // Never use shell for security
			windowsHide: true,
		});

		// Set up timeout
		const timeoutHandle = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");

			// Force kill after grace period
			setTimeout(() => {
				if (!child.killed) {
					child.kill("SIGKILL");
				}
			}, 1000);
		}, fullConfig.timeout);

		// Collect stdout
		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		// Collect stderr
		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		// Handle errors
		child.on("error", (error) => {
			clearTimeout(timeoutHandle);
			reject(
				new SandboxError(
					`Failed to execute command: ${error.message}`,
					"EXECUTION_FAILED",
					{ command, args, error },
				),
			);
		});

		// Handle completion
		child.on("close", (code, signal) => {
			clearTimeout(timeoutHandle);
			if (!timedOut && (signal === "SIGTERM" || signal === "SIGKILL")) {
				timedOut = true;
			}

			const duration = Date.now() - startTime;
			if (!timedOut && duration >= fullConfig.timeout) {
				timedOut = true;
			}

			resolve({
				exitCode: code,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				duration,
				timedOut,
				signal: signal || undefined,
			});
		});
	});
}

/**
 * Execute a shell command (higher risk, requires critical confirmation)
 */
export async function executeShellCommand(
	command: string,
	config: SandboxConfig = {},
): Promise<SandboxResult> {
	const fullConfig = { ...DEFAULT_CONFIG, ...config };

	// Always require confirmation for shell commands
	const confirmation = await requestConfirmation({
		operation: "sandbox.executeShell",
		description: `Execute shell command: ${command}`,
		riskLevel: RiskLevel.CRITICAL,
		context: {
			command,
			workingDirectory: fullConfig.cwd,
			shell: true,
		},
	});

	if (!confirmation.approved) {
		throw new SandboxError(
			"Shell command execution denied by user",
			"CONFIRMATION_DENIED",
			{ command, reason: confirmation.reason },
		);
	}

	const startTime = Date.now();

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Use sh/cmd as appropriate
		const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
		const shellArgs =
			process.platform === "win32" ? ["/c", command] : ["-c", command];

		const child = spawn(shell, shellArgs, {
			cwd: fullConfig.cwd,
			env: fullConfig.env,
			timeout: fullConfig.timeout,
			windowsHide: true,
		});

		const timeoutHandle = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			setTimeout(() => {
				if (!child.killed) {
					child.kill("SIGKILL");
				}
			}, 1000);
		}, fullConfig.timeout);

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("error", (error) => {
			clearTimeout(timeoutHandle);
			reject(
				new SandboxError(
					`Failed to execute shell command: ${error.message}`,
					"EXECUTION_FAILED",
					{ command, error },
				),
			);
		});

		child.on("close", (code, signal) => {
			clearTimeout(timeoutHandle);
			if (!timedOut && (signal === "SIGTERM" || signal === "SIGKILL")) {
				timedOut = true;
			}

			const duration = Date.now() - startTime;
			if (!timedOut && duration >= fullConfig.timeout) {
				timedOut = true;
			}

			resolve({
				exitCode: code,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				duration,
				timedOut,
				signal: signal || undefined,
			});
		});
	});
}

/**
 * Validate that a path is within allowed paths
 */
export function validatePath(path: string, allowedPaths: string[]): boolean {
	if (allowedPaths.length === 0) {
		return true; // No restrictions
	}

	const normalizedPath = join(path);
	return allowedPaths.some((allowed) => {
		const normalizedAllowed = join(allowed);
		return normalizedPath.startsWith(normalizedAllowed);
	});
}
