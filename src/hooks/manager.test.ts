import { describe, it, expect, beforeEach } from "bun:test";
import { HooksManager, type HookName, type HookPayload } from "./manager";

describe("HooksManager", () => {
  it("should register and emit hooks successfully", async () => {
    const manager = new HooksManager();
    const emitted: HookPayload[] = [];

    manager.on("beforeLoop", async (payload) => {
      emitted.push(payload);
    });

    await manager.emit("beforeLoop", { input: "test", historyLength: 0 });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ input: "test", historyLength: 0 });
  });

  it("should handle multiple handlers for the same event", async () => {
    const manager = new HooksManager();
    const calls: number[] = [];

    manager.on("afterLoop", () => calls.push(1));
    manager.on("afterLoop", () => calls.push(2));

    await manager.emit("afterLoop", { result: {}, iterations: 1 });

    expect(calls).toEqual([1, 2]);
  });

  it("should propagate handler errors in 'throw' mode", async () => {
    const manager = new HooksManager({ onError: 'throw' });

    manager.on("beforeTool", async () => {
      throw new Error("Handler failed");
    });

    await expect(manager.emit("beforeTool", { toolName: "test", args: {}, iteration: 1 })).rejects.toThrow("Handler failed");
  });

  it("should log errors and continue in 'log' mode (default)", async () => {
    const manager = new HooksManager(); // default is 'log'
    const calls: number[] = [];
    let loggedError = '';

    // Mock console.error
    const originalError = console.error;
    console.error = (msg: string) => {
      loggedError = msg;
    };

    manager.on("beforeLoop", async () => {
      throw new Error("First handler failed");
    });

    manager.on("beforeLoop", () => {
      calls.push(2);
    });

    await manager.emit("beforeLoop", { input: "test", historyLength: 0 });

    console.error = originalError;

    expect(loggedError).toContain("First handler failed");
    expect(calls).toEqual([2]); // Second handler should still execute
  });

  it("should silently swallow errors in 'silent' mode", async () => {
    const manager = new HooksManager({ onError: 'silent' });
    const calls: number[] = [];

    manager.on("afterLoop", async () => {
      throw new Error("Silent error");
    });

    manager.on("afterLoop", () => {
      calls.push(2);
    });

    await manager.emit("afterLoop", { result: {}, iterations: 1 });

    // No error thrown, second handler should still execute
    expect(calls).toEqual([2]);
  });

  it("should call custom error handler function", async () => {
    const errors: Array<{ error: Error; hookName: HookName }> = [];

    const manager = new HooksManager({
      onError: (error, hookName) => {
        errors.push({ error, hookName });
      },
    });

    const calls: number[] = [];

    manager.on("beforeTool", async () => {
      throw new Error("Custom handler error");
    });

    manager.on("beforeTool", () => {
      calls.push(2);
    });

    await manager.emit("beforeTool", { toolName: "test", args: {}, iteration: 1 });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.message).toBe("Custom handler error");
    expect(errors[0]?.hookName).toBe("beforeTool");
    expect(calls).toEqual([2]); // Second handler should still execute
  });

  it("should handle non-Error thrown values", async () => {
    const errors: Error[] = [];

    const manager = new HooksManager({
      onError: (error) => {
        errors.push(error);
      },
    });

    manager.on("onError", async () => {
      throw "string error"; // Not an Error object
    });

    await manager.emit("onError", { error: "test", iteration: 1 });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("string error");
  });

  it("should handle all hook names", async () => {
    const manager = new HooksManager();
    const hookNames: HookName[] = [
      "beforeLoop",
      "afterLoop",
      "beforeTool",
      "afterTool",
      "onError",
    ];

    for (const hookName of hookNames) {
      const called: boolean[] = [];
      manager.on(hookName, () => called.push(true));
      await manager.emit(hookName, {});
      expect(called).toHaveLength(1);
    }
  });

  it("should clear specific hooks", async () => {
    const manager = new HooksManager();
    const called: number[] = [];

    manager.on("beforeLoop", () => called.push(1));
    manager.on("afterLoop", () => called.push(2));

    manager.clear("beforeLoop");
    await manager.emit("beforeLoop", {});
    await manager.emit("afterLoop", {});

    expect(called).toEqual([2]);
  });

  it("should clear all hooks", async () => {
    const manager = new HooksManager();
    const called: number[] = [];

    manager.on("beforeLoop", () => called.push(1));
    manager.on("afterLoop", () => called.push(2));

    manager.clear();
    await manager.emit("beforeLoop", {});
    await manager.emit("afterLoop", {});

    expect(called).toEqual([]);
  });

  it("should support async handlers", async () => {
    const manager = new HooksManager();
    const order: string[] = [];

    manager.on("beforeLoop", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("async1");
    });

    manager.on("beforeLoop", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("async2");
    });

    await manager.emit("beforeLoop", {});

    // Handlers execute sequentially
    expect(order).toEqual(["async1", "async2"]);
  });
});
