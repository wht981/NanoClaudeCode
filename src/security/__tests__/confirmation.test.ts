/**
 * Tests for confirmation system
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
	type ConfirmationRequest,
	type ConfirmationResponse,
	RiskLevel,
	requestConfirmation,
	withConfirmation,
	setConfirmationHandler,
	getConfirmationHandler,
	ConfirmationDeniedError,
	DangerousOperations,
} from "../confirmation.ts";

describe("Confirmation System", () => {
	beforeEach(() => {
		// Reset handler before each test
		setConfirmationHandler(null as any);
	});

	describe("setConfirmationHandler", () => {
		it("should set and get confirmation handler", () => {
			const handler = async () => ({
				approved: true,
				timestamp: new Date(),
			});

			setConfirmationHandler(handler);
			expect(getConfirmationHandler()).toBe(handler);
		});
	});

	describe("requestConfirmation", () => {
		it("should auto-approve low risk without handler", async () => {
			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.LOW,
			};

			const response = await requestConfirmation(request);

			expect(response.approved).toBe(true);
			expect(response.reason).toContain("Auto-approved");
		});

		it("should auto-approve medium risk without handler", async () => {
			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.MEDIUM,
			};

			const response = await requestConfirmation(request);

			expect(response.approved).toBe(true);
		});

		it("should auto-deny high risk without handler", async () => {
			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.HIGH,
			};

			const response = await requestConfirmation(request);

			expect(response.approved).toBe(false);
			expect(response.reason).toContain("Auto-denied");
		});

		it("should auto-deny critical risk without handler", async () => {
			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.CRITICAL,
			};

			const response = await requestConfirmation(request);

			expect(response.approved).toBe(false);
		});

		it("should use custom handler when set", async () => {
			const customResponse: ConfirmationResponse = {
				approved: true,
				timestamp: new Date(),
				reason: "Custom approval",
			};

			setConfirmationHandler(async () => customResponse);

			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.CRITICAL,
			};

			const response = await requestConfirmation(request);

			expect(response).toBe(customResponse);
		});

		it("should pass correct request to handler", async () => {
			let receivedRequest: ConfirmationRequest | null = null;

			setConfirmationHandler(async (request) => {
				receivedRequest = request;
				return { approved: true, timestamp: new Date() };
			});

			const request: ConfirmationRequest = {
				operation: "test.operation",
				description: "Test operation",
				riskLevel: RiskLevel.HIGH,
				affectedResources: ["resource1", "resource2"],
				context: { foo: "bar" },
			};

			await requestConfirmation(request);

			expect(receivedRequest).toEqual(request);
		});
	});

	describe("withConfirmation", () => {
		it("should execute operation when confirmed", async () => {
			setConfirmationHandler(async () => ({
				approved: true,
				timestamp: new Date(),
			}));

			let executed = false;
			const operation = async () => {
				executed = true;
				return "result";
			};

			const result = await withConfirmation(
				{
					operation: "test.operation",
					description: "Test",
					riskLevel: RiskLevel.HIGH,
				},
				operation,
			);

			expect(executed).toBe(true);
			expect(result).toBe("result");
		});

		it("should throw when denied", async () => {
			setConfirmationHandler(async () => ({
				approved: false,
				timestamp: new Date(),
				reason: "User denied",
			}));

			const operation = async () => "result";

			await expect(
				withConfirmation(
					{
						operation: "test.operation",
						description: "Test",
						riskLevel: RiskLevel.HIGH,
					},
					operation,
				),
			).rejects.toThrow(ConfirmationDeniedError);
		});

		it("should not execute operation when denied", async () => {
			setConfirmationHandler(async () => ({
				approved: false,
				timestamp: new Date(),
			}));

			let executed = false;
			const operation = async () => {
				executed = true;
				return "result";
			};

			try {
				await withConfirmation(
					{
						operation: "test.operation",
						description: "Test",
						riskLevel: RiskLevel.HIGH,
					},
					operation,
				);
			} catch {
				// Expected
			}

			expect(executed).toBe(false);
		});
	});

	describe("DangerousOperations", () => {
		it("FILE_DELETE should create correct request", () => {
			const request = DangerousOperations.FILE_DELETE([
				"file1.txt",
				"file2.txt",
			]);

			expect(request.operation).toBe("file.delete");
			expect(request.riskLevel).toBe(RiskLevel.HIGH);
			expect(request.affectedResources).toEqual(["file1.txt", "file2.txt"]);
		});

		it("FILE_OVERWRITE should create correct request", () => {
			const request = DangerousOperations.FILE_OVERWRITE("important.txt");

			expect(request.operation).toBe("file.overwrite");
			expect(request.riskLevel).toBe(RiskLevel.MEDIUM);
			expect(request.affectedResources).toEqual(["important.txt"]);
		});

		it("COMMAND_EXECUTE should be HIGH risk by default", () => {
			const request = DangerousOperations.COMMAND_EXECUTE("npm install");

			expect(request.operation).toBe("command.execute");
			expect(request.riskLevel).toBe(RiskLevel.HIGH);
		});

		it("COMMAND_EXECUTE should be CRITICAL with shell", () => {
			const request = DangerousOperations.COMMAND_EXECUTE(
				"npm install",
				true,
			);

			expect(request.riskLevel).toBe(RiskLevel.CRITICAL);
		});

		it("DIRECTORY_DELETE should be CRITICAL when recursive", () => {
			const request = DangerousOperations.DIRECTORY_DELETE("/path", true);

			expect(request.operation).toBe("directory.delete");
			expect(request.riskLevel).toBe(RiskLevel.CRITICAL);
		});

		it("DIRECTORY_DELETE should be HIGH when not recursive", () => {
			const request = DangerousOperations.DIRECTORY_DELETE("/path", false);

			expect(request.riskLevel).toBe(RiskLevel.HIGH);
		});

		it("NETWORK_REQUEST should vary by method", () => {
			const getRequest = DangerousOperations.NETWORK_REQUEST(
				"https://api.example.com",
				"GET",
			);
			const postRequest = DangerousOperations.NETWORK_REQUEST(
				"https://api.example.com",
				"POST",
			);

			expect(getRequest.riskLevel).toBe(RiskLevel.LOW);
			expect(postRequest.riskLevel).toBe(RiskLevel.MEDIUM);
		});

		it("ENVIRONMENT_MODIFY should create correct request", () => {
			const request = DangerousOperations.ENVIRONMENT_MODIFY([
				"PATH",
				"NODE_ENV",
			]);

			expect(request.operation).toBe("environment.modify");
			expect(request.riskLevel).toBe(RiskLevel.MEDIUM);
			expect(request.affectedResources).toEqual(["PATH", "NODE_ENV"]);
		});
	});
});
