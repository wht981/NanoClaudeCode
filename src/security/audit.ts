/**
 * Audit logging system for security-sensitive operations
 * Provides comprehensive tracking and monitoring of all actions
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export enum AuditEventType {
	// Confirmation events
	CONFIRMATION_REQUESTED = "confirmation.requested",
	CONFIRMATION_APPROVED = "confirmation.approved",
	CONFIRMATION_DENIED = "confirmation.denied",

	// Sandbox events
	COMMAND_EXECUTED = "command.executed",
	COMMAND_FAILED = "command.failed",
	COMMAND_TIMEOUT = "command.timeout",
	COMMAND_BLOCKED = "command.blocked",

	// File operations
	FILE_READ = "file.read",
	FILE_WRITE = "file.write",
	FILE_DELETE = "file.delete",
	FILE_MODIFY = "file.modify",

	// Network operations
	NETWORK_REQUEST = "network.request",
	NETWORK_RESPONSE = "network.response",
	NETWORK_ERROR = "network.error",

	// Security events
	SECURITY_VIOLATION = "security.violation",
	PERMISSION_DENIED = "permission.denied",
	SUSPICIOUS_ACTIVITY = "suspicious.activity",

	// System events
	SESSION_START = "session.start",
	SESSION_END = "session.end",
	CONFIGURATION_CHANGE = "configuration.change",
}

export enum AuditSeverity {
	DEBUG = "debug",
	INFO = "info",
	WARNING = "warning",
	ERROR = "error",
	CRITICAL = "critical",
}

export interface AuditEvent {
	id: string;
	timestamp: Date;
	type: AuditEventType;
	severity: AuditSeverity;
	actor?: string;
	action: string;
	resource?: string;
	metadata?: Record<string, unknown>;
	result?: "success" | "failure" | "denied";
	error?: string;
	duration?: number;
}

export interface AuditLogConfig {
	logPath?: string;
	enableConsole?: boolean;
	enableFile?: boolean;
	maxFileSize?: number; // in MB
	retentionDays?: number;
	minimumSeverity?: AuditSeverity;
}

/**
 * Default audit log configuration
 */
const DEFAULT_CONFIG: Required<AuditLogConfig> = {
	logPath: join(process.cwd(), ".security", "audit.log"),
	enableConsole: false,
	enableFile: true,
	maxFileSize: 100, // 100 MB
	retentionDays: 90,
	minimumSeverity: AuditSeverity.INFO,
};

/**
 * Severity ordering for filtering
 */
const SEVERITY_ORDER: Record<AuditSeverity, number> = {
	[AuditSeverity.DEBUG]: 0,
	[AuditSeverity.INFO]: 1,
	[AuditSeverity.WARNING]: 2,
	[AuditSeverity.ERROR]: 3,
	[AuditSeverity.CRITICAL]: 4,
};

/**
 * Audit logger class
 */
export class AuditLogger {
	private config: Required<AuditLogConfig>;
	private eventListeners: Array<(event: AuditEvent) => void> = [];
	private eventBuffer: AuditEvent[] = [];
	private flushTimer?: NodeJS.Timeout;

	constructor(config: AuditLogConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.initializeLogDirectory();
	}

	/**
	 * Initialize the audit log directory
	 */
	private initializeLogDirectory(): void {
		const logDir = dirname(this.config.logPath);
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}
	}

	/**
	 * Generate a unique event ID
	 */
	private generateEventId(): string {
		return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Check if event meets minimum severity
	 */
	private meetsMinimumSeverity(severity: AuditSeverity): boolean {
		return (
			SEVERITY_ORDER[severity] >= SEVERITY_ORDER[this.config.minimumSeverity]
		);
	}

	/**
	 * Log an audit event
	 */
	public async log(
		type: AuditEventType,
		action: string,
		options: {
			severity?: AuditSeverity;
			actor?: string;
			resource?: string;
			metadata?: Record<string, unknown>;
			result?: "success" | "failure" | "denied";
			error?: string;
			duration?: number;
		} = {},
	): Promise<void> {
		const severity = options.severity || AuditSeverity.INFO;

		// Skip if below minimum severity
		if (!this.meetsMinimumSeverity(severity)) {
			return;
		}

		const event: AuditEvent = {
			id: this.generateEventId(),
			timestamp: new Date(),
			type,
			severity,
			action,
			...options,
		};

		// Add to buffer
		this.eventBuffer.push(event);

		// Notify listeners
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error("Error in audit event listener:", error);
			}
		}

		// Console output if enabled
		if (this.config.enableConsole) {
			this.logToConsole(event);
		}

		// Flush buffer if needed
		if (this.eventBuffer.length >= 10) {
			await this.flush();
		} else {
			// Schedule flush
			this.scheduleFlush();
		}
	}

	/**
	 * Schedule a buffer flush
	 */
	private scheduleFlush(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setTimeout(() => {
			this.flush().catch(console.error);
			this.flushTimer = undefined;
		}, 5000); // Flush every 5 seconds
	}

	/**
	 * Flush buffered events to file
	 */
	public async flush(): Promise<void> {
		if (this.eventBuffer.length === 0 || !this.config.enableFile) {
			return;
		}

		const events = [...this.eventBuffer];
		this.eventBuffer = [];

		const logEntries = events.map((event) => JSON.stringify(event)).join("\n");

		try {
			const logDir = dirname(this.config.logPath);
			if (!existsSync(logDir)) {
				await mkdir(logDir, { recursive: true });
			}
			await appendFile(this.config.logPath, logEntries + "\n");
		} catch (error) {
			console.error("Failed to write audit log:", error);
		}
	}

	/**
	 * Log to console
	 */
	private logToConsole(event: AuditEvent): void {
		const timestamp = event.timestamp.toISOString();
		const prefix = `[AUDIT] ${timestamp} [${event.severity.toUpperCase()}] ${event.type}`;
		const message = `${prefix}: ${event.action}`;

		switch (event.severity) {
			case AuditSeverity.DEBUG:
			case AuditSeverity.INFO:
				console.log(message, event.metadata || "");
				break;
			case AuditSeverity.WARNING:
				console.warn(message, event.metadata || "");
				break;
			case AuditSeverity.ERROR:
			case AuditSeverity.CRITICAL:
				console.error(message, event.metadata || "");
				break;
		}
	}

	/**
	 * Add an event listener
	 */
	public addEventListener(listener: (event: AuditEvent) => void): void {
		this.eventListeners.push(listener);
	}

	/**
	 * Remove an event listener
	 */
	public removeEventListener(listener: (event: AuditEvent) => void): void {
		const index = this.eventListeners.indexOf(listener);
		if (index !== -1) {
			this.eventListeners.splice(index, 1);
		}
	}

	/**
	 * Query audit logs from file
	 */
	public async query(options: {
		startDate?: Date;
		endDate?: Date;
		type?: AuditEventType;
		severity?: AuditSeverity;
		actor?: string;
		limit?: number;
	} = {}): Promise<AuditEvent[]> {
		// Flush any pending events first
		await this.flush();

		if (!existsSync(this.config.logPath)) {
			return [];
		}

		const content = await readFile(this.config.logPath, { encoding: "utf-8" });
		const lines = content.trim().split("\n");
		const events: AuditEvent[] = [];

		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const event = JSON.parse(line) as AuditEvent;
				event.timestamp = new Date(event.timestamp);

				// Apply filters
				if (options.startDate && event.timestamp < options.startDate) {
					continue;
				}
				if (options.endDate && event.timestamp > options.endDate) {
					continue;
				}
				if (options.type && event.type !== options.type) {
					continue;
				}
				if (options.severity && event.severity !== options.severity) {
					continue;
				}
				if (options.actor && event.actor !== options.actor) {
					continue;
				}

				events.push(event);

				if (options.limit && events.length >= options.limit) {
					break;
				}
			} catch (error) {
				console.error("Failed to parse audit log entry:", error);
			}
		}

		return events;
	}

	/**
	 * Close the logger and flush remaining events
	 */
	public async close(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
		}
		await this.flush();
	}
}

/**
 * Global audit logger instance
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * Initialize the global audit logger
 */
export function initializeAuditLogger(config?: AuditLogConfig): AuditLogger {
	globalAuditLogger = new AuditLogger(config);
	return globalAuditLogger;
}

/**
 * Get the global audit logger
 */
export function getAuditLogger(): AuditLogger {
	if (!globalAuditLogger) {
		globalAuditLogger = new AuditLogger();
	}
	return globalAuditLogger;
}

/**
 * Convenience function to log an audit event
 */
export async function logAuditEvent(
	type: AuditEventType,
	action: string,
	options?: Parameters<AuditLogger["log"]>[2],
): Promise<void> {
	const logger = getAuditLogger();
	await logger.log(type, action, options);
}
