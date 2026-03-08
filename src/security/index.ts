/**
 * Security layer index - exports all security components
 */

export * from "./confirmation.ts";
export * from "./sandbox.ts";
export * from "./audit.ts";

/**
 * Initialize the security layer with default configuration
 */
export async function initializeSecurity(options: {
	auditConfig?: import("./audit.ts").AuditLogConfig;
	confirmationHandler?: import("./confirmation.ts").ConfirmationHandler;
} = {}): Promise<void> {
	const { initializeAuditLogger } = await import("./audit.ts");
	const { setConfirmationHandler } = await import("./confirmation.ts");

	// Initialize audit logger
	initializeAuditLogger(options.auditConfig);

	// Set confirmation handler if provided
	if (options.confirmationHandler) {
		setConfirmationHandler(options.confirmationHandler);
	}
}
