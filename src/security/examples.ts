/**
 * Example usage of the security layer
 * This demonstrates how to integrate confirmation, sandbox, and audit logging
 */

import {
	initializeSecurity,
	requestConfirmation,
	withConfirmation,
	executeSandboxed,
	executeShellCommand,
	logAuditEvent,
	getAuditLogger,
	setConfirmationHandler,
	DangerousOperations,
	RiskLevel,
	AuditEventType,
	AuditSeverity,
} from "./index.ts";

/**
 * Example 1: Initialize the security layer
 */
async function example1_initialization() {
	console.log("Example 1: Initialization");

	await initializeSecurity({
		auditConfig: {
			logPath: ".security/audit.log",
			enableConsole: true,
			enableFile: true,
			minimumSeverity: AuditSeverity.INFO,
		},
		confirmationHandler: async (request) => {
			// In a real application, this would show a UI prompt
			console.log(`\n[CONFIRMATION REQUIRED]`);
			console.log(`Operation: ${request.operation}`);
			console.log(`Risk: ${request.riskLevel}`);
			console.log(`Description: ${request.description}`);
			console.log(
				`Resources: ${request.affectedResources?.join(", ") || "N/A"}`,
			);

			// Auto-approve for example purposes
			const approved = request.riskLevel !== RiskLevel.CRITICAL;

			return {
				approved,
				timestamp: new Date(),
				reason: approved
					? "Approved by example handler"
					: "CRITICAL operations require manual approval",
			};
		},
	});

	console.log("✓ Security layer initialized\n");
}

/**
 * Example 2: Execute sandboxed commands
 */
async function example2_sandboxedExecution() {
	console.log("Example 2: Sandboxed Command Execution");

	// Safe command
	const echoResult = await executeSandboxed(
		process.platform === "win32" ? "cmd" : "echo",
		process.platform === "win32" ? ["/c", "echo", "Hello"] : ["Hello"],
		{
			requireConfirmation: false,
		},
	);

	console.log("Echo output:", echoResult.stdout);
	console.log("Exit code:", echoResult.exitCode);
	console.log("Duration:", echoResult.duration, "ms");

	// Log the execution
	await logAuditEvent(AuditEventType.COMMAND_EXECUTED, "Executed echo", {
		severity: AuditSeverity.INFO,
		result: "success",
		duration: echoResult.duration,
	});

	console.log("✓ Command executed and logged\n");
}

/**
 * Example 3: Confirmation for dangerous operations
 */
async function example3_confirmationFlow() {
	console.log("Example 3: Confirmation Flow");

	// Request confirmation for file deletion
	const confirmation = await requestConfirmation(
		DangerousOperations.FILE_DELETE(["example.txt", "data.json"]),
	);

	console.log("Confirmation result:", confirmation.approved);
	console.log("Reason:", confirmation.reason);

	// Log the confirmation
	await logAuditEvent(
		confirmation.approved
			? AuditEventType.CONFIRMATION_APPROVED
			: AuditEventType.CONFIRMATION_DENIED,
		"File deletion confirmation",
		{
			severity: confirmation.approved
				? AuditSeverity.INFO
				: AuditSeverity.WARNING,
		},
	);

	console.log("✓ Confirmation processed\n");
}

/**
 * Example 4: Using withConfirmation wrapper
 */
async function example4_withConfirmationWrapper() {
	console.log("Example 4: withConfirmation Wrapper");

	try {
		await withConfirmation(
			DangerousOperations.COMMAND_EXECUTE("npm install", false),
			async () => {
				console.log("Executing npm install...");
				// In real code, would actually execute the command
				await logAuditEvent(
					AuditEventType.COMMAND_EXECUTED,
					"npm install",
					{
						severity: AuditSeverity.INFO,
						result: "success",
					},
				);
				return "Success";
			},
		);
		console.log("✓ Operation completed\n");
	} catch (error) {
		console.log("✗ Operation denied:", error);
	}
}

/**
 * Example 5: Audit log queries
 */
async function example5_auditQueries() {
	console.log("Example 5: Audit Log Queries");

	const logger = getAuditLogger();

	// Query recent events
	const recentEvents = await logger.query({
		limit: 10,
	});

	console.log(`Found ${recentEvents.length} recent events:`);
	for (const event of recentEvents) {
		console.log(
			`  - [${event.severity}] ${event.type}: ${event.action} (${event.timestamp.toISOString()})`,
		);
	}

	// Query by severity
	const criticalEvents = await logger.query({
		severity: AuditSeverity.CRITICAL,
	});

	console.log(`\nFound ${criticalEvents.length} critical events`);

	console.log("✓ Queries completed\n");
}

/**
 * Example 6: Event listeners
 */
async function example6_eventListeners() {
	console.log("Example 6: Event Listeners");

	const logger = getAuditLogger();

	// Add a listener for security violations
	logger.addEventListener((event) => {
		if (event.type === AuditEventType.SECURITY_VIOLATION) {
			console.log(`  🚨 SECURITY VIOLATION: ${event.action}`);
		}
	});

	// Trigger a security violation
	await logAuditEvent(
		AuditEventType.SECURITY_VIOLATION,
		"Suspicious command pattern detected",
		{
			severity: AuditSeverity.CRITICAL,
			metadata: { pattern: "rm -rf /" },
		},
	);

	console.log("✓ Event listener triggered\n");
}

/**
 * Example 7: Handling denied operations
 */
async function example7_deniedOperations() {
	console.log("Example 7: Handling Denied Operations");

	try {
		await withConfirmation(
			{
				operation: "test.critical",
				description: "Critical test operation",
				riskLevel: RiskLevel.CRITICAL,
			},
			async () => {
				console.log("This should not execute");
			},
		);
	} catch (error) {
		console.log("✓ Operation correctly denied");
		console.log("  Error:", error);
	}

	// Log the denial
	await logAuditEvent(
		AuditEventType.PERMISSION_DENIED,
		"Critical operation denied",
		{
			severity: AuditSeverity.WARNING,
		},
	);

	console.log("✓ Denial logged\n");
}

/**
 * Run all examples
 */
async function runAllExamples() {
	console.log("=".repeat(60));
	console.log("Security Layer Examples");
	console.log("=".repeat(60));
	console.log();

	await example1_initialization();
	await example2_sandboxedExecution();
	await example3_confirmationFlow();
	await example4_withConfirmationWrapper();
	await example5_auditQueries();
	await example6_eventListeners();
	await example7_deniedOperations();

	// Close the audit logger
	const logger = getAuditLogger();
	await logger.close();

	console.log("=".repeat(60));
	console.log("All examples completed!");
	console.log("=".repeat(60));
}

// Run if executed directly
if (import.meta.main) {
	runAllExamples().catch(console.error);
}

export { runAllExamples };
