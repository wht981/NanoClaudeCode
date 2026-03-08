/**
 * Tests for audit logging system
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
	AuditLogger,
	AuditEventType,
	AuditSeverity,
	initializeAuditLogger,
	getAuditLogger,
	logAuditEvent,
	type AuditEvent,
} from "../audit.ts";

const TEST_LOG_PATH = join(process.cwd(), ".security-test", "audit.log");

describe("Audit Logging System", () => {
	beforeEach(() => {
		// Clean up test logs
		if (existsSync(TEST_LOG_PATH)) {
			rmSync(TEST_LOG_PATH);
		}
		const logDir = TEST_LOG_PATH.substring(0, TEST_LOG_PATH.lastIndexOf("/"));
		if (existsSync(logDir)) {
			rmSync(logDir, { recursive: true });
		}
	});

	afterEach(async () => {
		// Clean up
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

	describe("AuditLogger", () => {
		it("should create audit logger with default config", () => {
			const logger = new AuditLogger();
			expect(logger).toBeDefined();
		});

		it("should create audit logger with custom config", () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
				enableConsole: true,
				minimumSeverity: AuditSeverity.WARNING,
			});
			expect(logger).toBeDefined();
		});

		it("should log events", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
				enableFile: true,
			});

			await logger.log(
				AuditEventType.COMMAND_EXECUTED,
				"Executed test command",
				{
					severity: AuditSeverity.INFO,
					actor: "test-user",
					resource: "test.sh",
					result: "success",
				},
			);

			await logger.flush();

			expect(existsSync(TEST_LOG_PATH)).toBe(true);
		});

		it("should filter by minimum severity", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
				minimumSeverity: AuditSeverity.WARNING,
			});

			await logger.log(AuditEventType.FILE_READ, "Read file", {
				severity: AuditSeverity.INFO,
			});

			await logger.log(AuditEventType.SECURITY_VIOLATION, "Security issue", {
				severity: AuditSeverity.WARNING,
			});

			await logger.flush();

			const events = await logger.query();
			expect(events.length).toBe(1);
			expect(events[0]?.type).toBe(AuditEventType.SECURITY_VIOLATION);
		});

		it("should call event listeners", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			let capturedEvent: AuditEvent | null = null;

			logger.addEventListener((event) => {
				capturedEvent = event;
			});

			await logger.log(AuditEventType.SESSION_START, "Session started", {
				severity: AuditSeverity.INFO,
			});

			expect(capturedEvent).not.toBeNull();
			expect(capturedEvent?.type).toBe(AuditEventType.SESSION_START);
		});

		it("should remove event listeners", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			let callCount = 0;
			const listener = () => {
				callCount++;
			};

			logger.addEventListener(listener);

			await logger.log(AuditEventType.FILE_READ, "Read file");
			expect(callCount).toBe(1);

			logger.removeEventListener(listener);

			await logger.log(AuditEventType.FILE_READ, "Read file");
			expect(callCount).toBe(1); // Not incremented
		});

		it("should query events by date range", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			const now = new Date();
			const past = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
			const future = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now

			await logger.log(AuditEventType.FILE_READ, "Read file 1");
			await logger.flush();

			const events = await logger.query({
				startDate: past,
				endDate: future,
			});

			expect(events.length).toBeGreaterThan(0);
		});

		it("should query events by type", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			await logger.log(AuditEventType.FILE_READ, "Read file");
			await logger.log(AuditEventType.FILE_WRITE, "Write file");
			await logger.log(AuditEventType.FILE_DELETE, "Delete file");
			await logger.flush();

			const events = await logger.query({
				type: AuditEventType.FILE_WRITE,
			});

			expect(events.length).toBe(1);
			expect(events[0]?.type).toBe(AuditEventType.FILE_WRITE);
		});

		it("should query events by severity", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
				minimumSeverity: AuditSeverity.DEBUG,
			});

			await logger.log(AuditEventType.FILE_READ, "Read file", {
				severity: AuditSeverity.INFO,
			});
			await logger.log(AuditEventType.SECURITY_VIOLATION, "Violation", {
				severity: AuditSeverity.CRITICAL,
			});
			await logger.flush();

			const events = await logger.query({
				severity: AuditSeverity.CRITICAL,
			});

			expect(events.length).toBe(1);
			expect(events[0]?.severity).toBe(AuditSeverity.CRITICAL);
		});

		it("should query events by actor", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			await logger.log(AuditEventType.FILE_READ, "Read file", {
				actor: "user1",
			});
			await logger.log(AuditEventType.FILE_WRITE, "Write file", {
				actor: "user2",
			});
			await logger.flush();

			const events = await logger.query({
				actor: "user1",
			});

			expect(events.length).toBe(1);
			expect(events[0]?.actor).toBe("user1");
		});

		it("should limit query results", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			for (let i = 0; i < 10; i++) {
				await logger.log(AuditEventType.FILE_READ, `Read file ${i}`);
			}
			await logger.flush();

			const events = await logger.query({ limit: 5 });

			expect(events.length).toBe(5);
		});

		it("should auto-flush on buffer size", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			// Log enough events to trigger auto-flush (threshold is 10)
			for (let i = 0; i < 11; i++) {
				await logger.log(AuditEventType.FILE_READ, `Read file ${i}`);
			}

			// Small delay to allow async flush
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(existsSync(TEST_LOG_PATH)).toBe(true);
		});

		it("should include metadata in events", async () => {
			const logger = new AuditLogger({
				logPath: TEST_LOG_PATH,
			});

			const metadata = {
				foo: "bar",
				count: 42,
				nested: { key: "value" },
			};

			await logger.log(AuditEventType.FILE_WRITE, "Write with metadata", {
				metadata,
			});
			await logger.flush();

			const events = await logger.query();

			expect(events[0]?.metadata).toEqual(metadata);
		});
	});

	describe("Global Logger Functions", () => {
		it("should initialize global logger", () => {
			const logger = initializeAuditLogger({
				logPath: TEST_LOG_PATH,
			});

			expect(logger).toBeDefined();
			expect(getAuditLogger()).toBe(logger);
		});

		it("should create default logger if not initialized", () => {
			const logger = getAuditLogger();
			expect(logger).toBeDefined();
		});

		it("should log via convenience function", async () => {
			initializeAuditLogger({
				logPath: TEST_LOG_PATH,
			});

			await logAuditEvent(AuditEventType.SESSION_START, "Session started", {
				severity: AuditSeverity.INFO,
				actor: "test",
			});

			const logger = getAuditLogger();
			await logger.flush();

			expect(existsSync(TEST_LOG_PATH)).toBe(true);
		});
	});

	describe("Event Types", () => {
		it("should support all confirmation event types", async () => {
			const logger = new AuditLogger({ logPath: TEST_LOG_PATH });

			await logger.log(
				AuditEventType.CONFIRMATION_REQUESTED,
				"Confirmation requested",
			);
			await logger.log(
				AuditEventType.CONFIRMATION_APPROVED,
				"Confirmation approved",
			);
			await logger.log(
				AuditEventType.CONFIRMATION_DENIED,
				"Confirmation denied",
			);

			await logger.flush();

			const events = await logger.query();
			expect(events.length).toBe(3);
		});

		it("should support all sandbox event types", async () => {
			const logger = new AuditLogger({ logPath: TEST_LOG_PATH });

			await logger.log(AuditEventType.COMMAND_EXECUTED, "Command executed");
			await logger.log(AuditEventType.COMMAND_FAILED, "Command failed");
			await logger.log(AuditEventType.COMMAND_TIMEOUT, "Command timeout");
			await logger.log(AuditEventType.COMMAND_BLOCKED, "Command blocked");

			await logger.flush();

			const events = await logger.query();
			expect(events.length).toBe(4);
		});

		it("should support all security event types", async () => {
			const logger = new AuditLogger({ logPath: TEST_LOG_PATH });

			await logger.log(
				AuditEventType.SECURITY_VIOLATION,
				"Security violation",
			);
			await logger.log(AuditEventType.PERMISSION_DENIED, "Permission denied");
			await logger.log(
				AuditEventType.SUSPICIOUS_ACTIVITY,
				"Suspicious activity",
			);

			await logger.flush();

			const events = await logger.query();
			expect(events.length).toBe(3);
		});
	});
});
