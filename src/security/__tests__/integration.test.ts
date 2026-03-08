/**
 * Integration tests for security layer
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initializeSecurity } from "../index.ts";
import {
	executeSandboxed,
	type SandboxConfig,
} from "../sandbox.ts";
import {
	RiskLevel,
	requestConfirmation,
	setConfirmationHandler,
	withConfirmation,
	DangerousOperations,
} from "../confirmation.ts";
import {
	getAuditLogger,
	AuditEventType,
	AuditSeverity,
	type AuditEvent,
} from "../audit.ts";

const TEST_LOG_PATH = join(process.cwd(), ".security-test-integration", "audit.log");

describe("Security Layer Integration", () => {
	beforeEach(async () => {
		// Clean up test logs
		if (existsSync(TEST_LOG_PATH)) {
			rmSync(TEST_LOG_PATH);
		}
		const logDir = TEST_LOG_PATH.substring(0, TEST_LOG_PATH.lastIndexOf("/"));
		if (existsSync(logDir)) {
			rmSync(logDir, { recursive: true });
		}

		// Initialize security layer
		await initializeSecurity({
			auditConfig: {
				logPath: TEST_LOG_PATH,
				enableFile: true,
				minimumSeverity: AuditSeverity.DEBUG,
			},
		});
	});

	afterEach(async () => {
		const logger = getAuditLogger();
		await logger.close();

		if (existsSync(TEST_LOG_PATH)) {
			rmSync(TEST_LOG_PATH);
		}
		const logDir = TEST_LOG_PATH.substring(0, TEST_LOG_PATH.lastIndexOf("/"));
		if (existsSync(logDir)) {
			rmSync(logDir, { recursive: true });
		}
	});

	describe("Complete Workflow", () => {
		it("should log confirmation and execution events", async () => {
			const logger = getAuditLogger();
			const capturedEvents: AuditEvent[] = [];

			logger.addEventListener((event) => {
				capturedEvents.push(event);
			});

			// Set up handler that approves and logs
			setConfirmationHandler(async (request) => {
				await logger.log(
					AuditEventType.CONFIRMATION_REQUESTED,
					`Confirmation requested: ${request.operation}`,
					{
						severity: AuditSeverity.INFO,
						metadata: { request },
					},
				);

				const approved = true;

				await logger.log(
					approved
						? AuditEventType.CONFIRMATION_APPROVED
						: AuditEventType.CONFIRMATION_DENIED,
					`Confirmation ${approved ? "approved" : "denied"}: ${request.operation}`,
					{
						severity: approved ? AuditSeverity.INFO : AuditSeverity.WARNING,
					},
				);

				return { approved, timestamp: new Date() };
			});

			// Execute a sandboxed command
			const command = process.platform === "win32" ? "cmd" : "echo";
			const args =
				process.platform === "win32" ? ["/c", "echo", "test"] : ["test"];

			await executeSandboxed(command, args, {
				requireConfirmation: false,
			});

			// Log the execution
			await logger.log(
				AuditEventType.COMMAND_EXECUTED,
				`Executed: ${command} ${args.join(" ")}`,
				{
					severity: AuditSeverity.INFO,
					result: "success",
				},
			);

			await logger.flush();

			// Verify events were captured
			expect(capturedEvents.length).toBeGreaterThan(0);

			// Verify events were written to file
			const events = await logger.query();
			expect(events.length).toBeGreaterThan(0);
		});

		it("should handle denied operations with audit trail", async () => {
			const logger = getAuditLogger();

			setConfirmationHandler(async (request) => {
				await logger.log(
					AuditEventType.CONFIRMATION_REQUESTED,
					`Confirmation requested: ${request.operation}`,
					{
						severity: AuditSeverity.INFO,
						metadata: { request },
					},
				);

				await logger.log(
					AuditEventType.CONFIRMATION_DENIED,
					`Confirmation denied: ${request.operation}`,
					{
						severity: AuditSeverity.WARNING,
						metadata: { reason: "Test denial" },
					},
				);

				return {
					approved: false,
					timestamp: new Date(),
					reason: "Test denial",
				};
			});

			// Try to execute dangerous operation
			try {
				await withConfirmation(
					DangerousOperations.FILE_DELETE(["/important/file.txt"]),
					async () => {
						throw new Error("Should not reach here");
					},
				);
			} catch (error) {
				// Expected
			}

			await logger.flush();

			// Verify audit trail
			const events = await logger.query();
			expect(
				events.some((e) => e.type === AuditEventType.CONFIRMATION_REQUESTED),
			).toBe(true);
			expect(
				events.some((e) => e.type === AuditEventType.CONFIRMATION_DENIED),
			).toBe(true);
		});

		it("should audit sandbox timeouts", async () => {
			const logger = getAuditLogger();

			setConfirmationHandler(async () => ({
				approved: true,
				timestamp: new Date(),
			}));

			const command = process.execPath;
			const args = ["-e", "setTimeout(() => {}, 5000)"];

			const result = await executeSandboxed(command, args, {
				timeout: 500,
				requireConfirmation: false,
			});

			await logger.log(
				result.timedOut
					? AuditEventType.COMMAND_TIMEOUT
					: AuditEventType.COMMAND_EXECUTED,
				`Command ${result.timedOut ? "timed out" : "completed"}: ${command}`,
				{
					severity: result.timedOut
						? AuditSeverity.WARNING
						: AuditSeverity.INFO,
					result: result.timedOut ? "failure" : "success",
					duration: result.duration,
				},
			);

			await logger.flush();

			const events = await logger.query({
				type: AuditEventType.COMMAND_TIMEOUT,
			});

			expect(events.length).toBeGreaterThan(0);
		}, 10000);

		it("should track suspicious patterns", async () => {
			const logger = getAuditLogger();

			setConfirmationHandler(async (request) => {
				// Log suspicious activity for dangerous commands
				if (request.riskLevel === RiskLevel.CRITICAL) {
					await logger.log(
						AuditEventType.SUSPICIOUS_ACTIVITY,
						`Suspicious command detected: ${request.description}`,
						{
							severity: AuditSeverity.CRITICAL,
							metadata: { request },
						},
					);
				}

				return {
					approved: false,
					timestamp: new Date(),
					reason: "Dangerous command blocked",
				};
			});

			// Try to execute dangerous command
			try {
				await requestConfirmation(
					DangerousOperations.COMMAND_EXECUTE("rm -rf /", true),
				);
			} catch (error) {
				// Expected
			}

			await logger.flush();

			const events = await logger.query({
				type: AuditEventType.SUSPICIOUS_ACTIVITY,
			});

			expect(events.length).toBeGreaterThan(0);
			expect(events[0]?.severity).toBe(AuditSeverity.CRITICAL);
		});

		it("should correlate events with metadata", async () => {
			const logger = getAuditLogger();
			const sessionId = "test-session-123";

			setConfirmationHandler(async (request) => {
				await logger.log(
					AuditEventType.CONFIRMATION_REQUESTED,
					`Confirmation for: ${request.operation}`,
					{
						severity: AuditSeverity.INFO,
						metadata: { sessionId, operation: request.operation },
					},
				);

				return { approved: true, timestamp: new Date() };
			});

			// Execute operation
			await requestConfirmation({
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.HIGH,
			});

			await logger.log(AuditEventType.COMMAND_EXECUTED, "Operation completed", {
				severity: AuditSeverity.INFO,
				metadata: { sessionId },
			});

			await logger.flush();

			// Query by session
			const events = await logger.query();
			const sessionEvents = events.filter(
				(e) =>
					e.metadata &&
					typeof e.metadata === "object" &&
					"sessionId" in e.metadata &&
					e.metadata.sessionId === sessionId,
			);

			expect(sessionEvents.length).toBeGreaterThan(0);
		});
	});

	describe("Error Scenarios", () => {
		it("should log failed commands", async () => {
			const logger = getAuditLogger();

			try {
				await executeSandboxed("nonexistent-command-xyz", [], {
					requireConfirmation: false,
				});
			} catch (error) {
				await logger.log(
					AuditEventType.COMMAND_FAILED,
					"Command execution failed",
					{
						severity: AuditSeverity.ERROR,
						error: error instanceof Error ? error.message : String(error),
					},
				);
			}

			await logger.flush();

			const events = await logger.query({
				type: AuditEventType.COMMAND_FAILED,
			});

			expect(events.length).toBeGreaterThan(0);
		});

		it("should handle listener errors gracefully", async () => {
			const logger = getAuditLogger();

			// Add a listener that throws
			logger.addEventListener(() => {
				throw new Error("Listener error");
			});

			// Should not throw
			await expect(
				logger.log(AuditEventType.FILE_READ, "Test event"),
			).resolves.toBeUndefined();
		});
	});
});
