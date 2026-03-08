import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager, type RuntimeConfig } from "../manager";

describe("ConfigManager", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Store original env vars
    const envKeys = [
      "NANO_MODEL",
      "NANO_PROVIDER",
      "NANO_MAX_CONSECUTIVE_ERRORS",
      "NANO_TOOL_TIMEOUT_MS",
      "NANO_ENABLE_SECURITY",
      "NANO_ENABLE_SESSIONS",
      "NANO_ENABLE_LSP",
      "NANO_ENABLE_HOOKS",
      "NANO_ENABLE_PLUGINS",
      "NANO_ENABLE_SKILLS",
    ];
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("should load default values correctly", async () => {
    const config = await new ConfigManager().load();

    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.maxIterations).toBe(15);
    expect(config.maxConsecutiveErrors).toBe(3);
    expect(config.toolTimeoutMs).toBe(60000);
    expect(config.enableSecurity).toBe(true);
    expect(config.enableSessions).toBe(true);
    expect(config.enableLsp).toBe(true);
    expect(config.enableHooks).toBe(true);
    expect(config.enablePlugins).toBe(true);
    expect(config.enableSkills).toBe(true);
  });

  it("should override numeric values with env vars", async () => {
    process.env.NANO_MAX_CONSECUTIVE_ERRORS = "5";
    process.env.NANO_TOOL_TIMEOUT_MS = "120000";

    const config = await new ConfigManager().load();

    expect(config.maxConsecutiveErrors).toBe(5);
    expect(config.toolTimeoutMs).toBe(120000);
  });

  it("should parse boolean env var 'false' as false", async () => {
    process.env.NANO_ENABLE_SECURITY = "false";
    const config = await new ConfigManager().load();
    expect(config.enableSecurity).toBe(false);
  });

  it("should parse boolean env var '0' as false", async () => {
    process.env.NANO_ENABLE_SESSIONS = "0";
    const config = await new ConfigManager().load();
    expect(config.enableSessions).toBe(false);
  });

  it("should parse boolean env var 'no' as false", async () => {
    process.env.NANO_ENABLE_LSP = "no";
    const config = await new ConfigManager().load();
    expect(config.enableLsp).toBe(false);
  });

  it("should parse boolean env var 'true' as true", async () => {
    process.env.NANO_ENABLE_HOOKS = "true";
    const config = await new ConfigManager().load();
    expect(config.enableHooks).toBe(true);
  });

  it("should parse boolean env var '1' as true", async () => {
    process.env.NANO_ENABLE_PLUGINS = "1";
    const config = await new ConfigManager().load();
    expect(config.enablePlugins).toBe(true);
  });

  it("should parse boolean env var 'yes' as true", async () => {
    process.env.NANO_ENABLE_SKILLS = "yes";
    const config = await new ConfigManager().load();
    expect(config.enableSkills).toBe(true);
  });

  it("should handle multiple env var overrides together", async () => {
    process.env.NANO_MAX_CONSECUTIVE_ERRORS = "10";
    process.env.NANO_TOOL_TIMEOUT_MS = "30000";
    process.env.NANO_ENABLE_SECURITY = "false";
    process.env.NANO_ENABLE_SESSIONS = "no";
    process.env.NANO_ENABLE_LSP = "0";

    const config = await new ConfigManager().load();

    expect(config.maxConsecutiveErrors).toBe(10);
    expect(config.toolTimeoutMs).toBe(30000);
    expect(config.enableSecurity).toBe(false);
    expect(config.enableSessions).toBe(false);
    expect(config.enableLsp).toBe(false);
    // Others should remain as default true
    expect(config.enableHooks).toBe(true);
    expect(config.enablePlugins).toBe(true);
    expect(config.enableSkills).toBe(true);
  });

  it("should apply cli overrides over env vars", async () => {
    process.env.NANO_MAX_CONSECUTIVE_ERRORS = "5";
    process.env.NANO_ENABLE_SECURITY = "false";

    const cliOverrides: Partial<RuntimeConfig> = {
      maxConsecutiveErrors: 20,
      enableSecurity: true,
    };

    const config = await new ConfigManager().load(undefined, cliOverrides);

    expect(config.maxConsecutiveErrors).toBe(20);
    expect(config.enableSecurity).toBe(true);
  });

  it("should not override when env var is not set", async () => {
    const config = await new ConfigManager().load();
    expect(config.maxConsecutiveErrors).toBe(3);
    expect(config.enableSecurity).toBe(true);
  });

  it("should case-insensitively parse boolean env vars", async () => {
    process.env.NANO_ENABLE_HOOKS = "FALSE";
    process.env.NANO_ENABLE_PLUGINS = "FALSE";
    process.env.NANO_ENABLE_SKILLS = "FALSE";

    const config = await new ConfigManager().load();

    expect(config.enableHooks).toBe(false);
    expect(config.enablePlugins).toBe(false);
    expect(config.enableSkills).toBe(false);
  });
});
