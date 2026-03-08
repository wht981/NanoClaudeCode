/**
 * Confirmation system for dangerous operations
 * Provides user confirmation prompts and automatic denial for high-risk actions
 */

export enum RiskLevel {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

export interface ConfirmationRequest {
	operation: string;
	description: string;
	riskLevel: RiskLevel;
	affectedResources?: string[];
	context?: Record<string, unknown>;
}

export interface ConfirmationResponse {
	approved: boolean;
	timestamp: Date;
	reason?: string;
	userInput?: string;
}

export type ConfirmationHandler = (
	request: ConfirmationRequest,
) => Promise<ConfirmationResponse>;

/**
 * Default confirmation handler - can be overridden
 */
let confirmationHandler: ConfirmationHandler | null = null;

/**
 * Set the confirmation handler implementation
 */
export function setConfirmationHandler(handler: ConfirmationHandler): void {
	confirmationHandler = handler;
}

/**
 * Get the current confirmation handler
 */
export function getConfirmationHandler(): ConfirmationHandler | null {
	return confirmationHandler;
}

/**
 * Request confirmation for a dangerous operation
 */
export async function requestConfirmation(
	request: ConfirmationRequest,
): Promise<ConfirmationResponse> {
	// If no handler is set, auto-deny critical operations, auto-approve low risk
	if (!confirmationHandler) {
		const approved =
			request.riskLevel === RiskLevel.LOW ||
			request.riskLevel === RiskLevel.MEDIUM;
		return {
			approved,
			timestamp: new Date(),
			reason: approved
				? "Auto-approved: No confirmation handler set, operation is low/medium risk"
				: "Auto-denied: No confirmation handler set, operation is high/critical risk",
		};
	}

	return await confirmationHandler(request);
}

/**
 * Wrapper for operations requiring confirmation
 */
export async function withConfirmation<T>(
	request: ConfirmationRequest,
	operation: () => Promise<T>,
): Promise<T> {
	const response = await requestConfirmation(request);

	if (!response.approved) {
		throw new ConfirmationDeniedError(
			`Operation '${request.operation}' was denied: ${response.reason || "User declined"}`,
			request,
			response,
		);
	}

	return await operation();
}

/**
 * Error thrown when confirmation is denied
 */
export class ConfirmationDeniedError extends Error {
	constructor(
		message: string,
		public readonly request: ConfirmationRequest,
		public readonly response: ConfirmationResponse,
	) {
		super(message);
		this.name = "ConfirmationDeniedError";
	}
}

/**
 * Predefined dangerous operations patterns
 */
export const DangerousOperations = {
	FILE_DELETE: (paths: string[]) => ({
		operation: "file.delete",
		description: `Delete ${paths.length} file(s)`,
		riskLevel: RiskLevel.HIGH,
		affectedResources: paths,
	}),

	FILE_OVERWRITE: (path: string) => ({
		operation: "file.overwrite",
		description: `Overwrite existing file: ${path}`,
		riskLevel: RiskLevel.MEDIUM,
		affectedResources: [path],
	}),

	COMMAND_EXECUTE: (command: string, shell = false) => ({
		operation: "command.execute",
		description: `Execute command: ${command}`,
		riskLevel: shell ? RiskLevel.CRITICAL : RiskLevel.HIGH,
		context: { command, shell },
	}),

	DIRECTORY_DELETE: (path: string, recursive: boolean) => ({
		operation: "directory.delete",
		description: `Delete directory: ${path}${recursive ? " (recursive)" : ""}`,
		riskLevel: recursive ? RiskLevel.CRITICAL : RiskLevel.HIGH,
		affectedResources: [path],
	}),

	NETWORK_REQUEST: (url: string, method: string) => ({
		operation: "network.request",
		description: `${method} request to ${url}`,
		riskLevel: method === "POST" || method === "PUT" || method === "DELETE"
			? RiskLevel.MEDIUM
			: RiskLevel.LOW,
		context: { url, method },
	}),

	ENVIRONMENT_MODIFY: (variables: string[]) => ({
		operation: "environment.modify",
		description: `Modify ${variables.length} environment variable(s)`,
		riskLevel: RiskLevel.MEDIUM,
		affectedResources: variables,
	}),
} as const;
