import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export interface RuntimeConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  model?: string;
  provider?: "anthropic" | "openai";
  workingDirectory: string;
  maxIterations: number;
  maxConsecutiveErrors: number;
  toolTimeoutMs: number;
  enableSecurity: boolean;
  enableSessions: boolean;
  enableLsp: boolean;
  enableHooks: boolean;
  enablePlugins: boolean;
  enableSkills: boolean;
}

function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return true;
}

export class ConfigManager {
  private readonly defaults: RuntimeConfig = {
    provider: "openai",
    model: "gpt-4o-mini",
    workingDirectory: process.cwd(),
    maxIterations: 15,
    maxConsecutiveErrors: 3,
    toolTimeoutMs: 60000,
    enableSecurity: true,
    enableSessions: true,
    enableLsp: true,
    enableHooks: true,
    enablePlugins: true,
    enableSkills: true,
  };

  async load(configPath?: string, cliOverrides: Partial<RuntimeConfig> = {}): Promise<RuntimeConfig> {
    const envLayer: Partial<RuntimeConfig> = {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      model: process.env.NANO_MODEL,
      provider: process.env.NANO_PROVIDER as RuntimeConfig["provider"] | undefined,
      maxConsecutiveErrors: process.env.NANO_MAX_CONSECUTIVE_ERRORS ? parseInt(process.env.NANO_MAX_CONSECUTIVE_ERRORS, 10) : undefined,
      toolTimeoutMs: process.env.NANO_TOOL_TIMEOUT_MS ? parseInt(process.env.NANO_TOOL_TIMEOUT_MS, 10) : undefined,
      enableSecurity: parseBoolEnv(process.env.NANO_ENABLE_SECURITY),
      enableSessions: parseBoolEnv(process.env.NANO_ENABLE_SESSIONS),
      enableLsp: parseBoolEnv(process.env.NANO_ENABLE_LSP),
      enableHooks: parseBoolEnv(process.env.NANO_ENABLE_HOOKS),
      enablePlugins: parseBoolEnv(process.env.NANO_ENABLE_PLUGINS),
      enableSkills: parseBoolEnv(process.env.NANO_ENABLE_SKILLS),
    };

    const fileLayer = configPath ? await this.loadFile(configPath) : {};

    // Filter out undefined values to prevent overriding defaults
    const cleanEnvLayer = Object.fromEntries(
      Object.entries(envLayer).filter(([, value]) => value !== undefined)
    ) as Partial<RuntimeConfig>;

    return {
      ...this.defaults,
      ...fileLayer,
      ...cleanEnvLayer,
      ...cliOverrides,
    };
  }

  private async loadFile(configPath: string): Promise<Partial<RuntimeConfig>> {
    if (!existsSync(configPath)) {
      return {};
    }
    try {
      const content = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(content) as Partial<RuntimeConfig>;
      return parsed;
    } catch {
      return {};
    }
  }
}
