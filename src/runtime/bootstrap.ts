import path from "node:path";
import { mkdirSync } from "node:fs";
import { ConfigManager, type RuntimeConfig } from "../config/manager";
import { ProviderManager } from "../providers/manager";
import { ToolRegistry } from "../tools/registry";
import { ToolExecutor } from "../tools/executor";
import { BaseTool } from "../tools/base";
import { FileTool } from "../tools/file";
import { ShellTool } from "../tools/shell";
import { SearchTool } from "../tools/search";
import { GitTool } from "../tools/git";
import { WebTool } from "../tools/web";
import { LSPTool } from "../tools/lsp";
import { initializeSecurity } from "../security";
import type { ConfirmationRequest, ConfirmationResponse } from "../security/confirmation";
import { createSessionManager, type SessionManager } from "../session/manager";
import { HooksManager } from "../hooks/manager";
import { PluginManager } from "../plugins/manager";
import { SkillsManager } from "../skills/manager";
import { InMemoryContextManager } from "../context/manager";
import type { ContextManager } from "../types/context";

export interface BootstrapOptions {
  confirmationHandler: (request: ConfirmationRequest) => Promise<ConfirmationResponse>;
  configOverrides?: Partial<RuntimeConfig>;
}

export interface BootstrapResult {
  config: RuntimeConfig;
  providerManager: ProviderManager;
  tools: BaseTool[];
  registry: ToolRegistry;
  executor: ToolExecutor;
  hooks: HooksManager | undefined;
  sessionManager: SessionManager | undefined;
  pluginManager: PluginManager | undefined;
  skillsManager: SkillsManager | undefined;
  contextManager: ContextManager | undefined;
  cleanup: () => Promise<void>;
}

export async function bootstrapRuntime(options: BootstrapOptions): Promise<BootstrapResult> {
  const config = await new ConfigManager().load(undefined, options.configOverrides ?? {});
  const cwd = process.cwd();

  const providerManager = new ProviderManager({
    provider: config.provider,
    model: config.model,
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
  });
  await providerManager.connect(config.provider);

  let securityInitialized = false;
  if (config.enableSecurity) {
    await initializeSecurity({
      confirmationHandler: options.confirmationHandler,
    });
    securityInitialized = true;
  }

  let sessionManager: SessionManager | undefined;
  if (config.enableSessions) {
    const nanoDir = path.join(cwd, ".nano");
    mkdirSync(nanoDir, { recursive: true });
    sessionManager = createSessionManager(path.join(nanoDir, "sessions.db"));
  }

  let pluginManager: PluginManager | undefined;
  if (config.enablePlugins) {
    pluginManager = new PluginManager();
    try {
      await pluginManager.setupAll({ cwd });
    } catch (error) {
      console.error(`Plugin setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let skillsManager: SkillsManager | undefined;
  if (config.enableSkills) {
    skillsManager = new SkillsManager();
  }

  const hooks = config.enableHooks ? new HooksManager() : undefined;
  const contextManager: ContextManager | undefined = new InMemoryContextManager(128000, 4096);

  const tools: BaseTool[] = [
    new FileTool(cwd),
    new ShellTool({ cwd }),
    new SearchTool(cwd),
    new GitTool(),
    new WebTool(),
  ];
  if (config.enableLsp) {
    tools.push(new LSPTool(cwd));
  }

  const registry = new ToolRegistry();
  registry.registerMany(tools);
  const executor = new ToolExecutor(registry);

  let cleanupDone = false;
  const cleanup = async (): Promise<void> => {
    if (cleanupDone) {
      return;
    }
    cleanupDone = true;

    if (sessionManager) {
      try {
        await sessionManager.close();
      } catch (error) {
        console.error(`Session cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (securityInitialized) {
      try {
        const { getAuditLogger } = await import("../security/audit");
        await getAuditLogger().close();
      } catch (error) {
        console.error(`Audit cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (pluginManager) {
      try {
        await pluginManager.disposeAll();
      } catch (error) {
        console.error(`Plugin cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  return {
    config,
    providerManager,
    tools,
    registry,
    executor,
    hooks,
    sessionManager,
    pluginManager,
    skillsManager,
    contextManager,
    cleanup,
  };
}
