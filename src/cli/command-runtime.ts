import type { SlashCommand } from "./slash-commands";
import type { ProviderId, ProviderManager } from "../providers/manager";
import type { SessionManager } from "../session/manager";

export interface CommandRuntimeResult {
  lines: string[];
  shouldExit?: boolean;
  shouldClear?: boolean;
}

export interface CommandRuntimeContext {
  sessionManager?: SessionManager;
}

function parseProvider(value: string | undefined): ProviderId | null {
  if (!value) return null;
  if (value === "openai" || value === "anthropic") return value;
  return null;
}

export async function executeSlashCommand(
  command: SlashCommand,
  providerManager: ProviderManager,
  context?: CommandRuntimeContext,
): Promise<CommandRuntimeResult> {
  if (command.name === "help") {
    const { getSlashHelp } = await import("./slash-commands");
    return { lines: [getSlashHelp()] };
  }

  if (command.name === "exit") {
    return { lines: ["Exiting..."], shouldExit: true };
  }

  if (command.name === "clear") {
    return { lines: ["Cleared."], shouldClear: true };
  }

  if (command.name === "status") {
    const status = providerManager.getStatus();
    return {
      lines: [
        `Provider: ${status.provider}`,
        `State: ${status.state}`,
        `Model: ${status.model ?? "not set"}`,
        `Message: ${status.message ?? "-"}`,
      ],
    };
  }

  if (command.name === "provider") {
    if (command.args.length === 0) {
      const status = providerManager.getStatus();
      return { lines: [`Current provider: ${status.provider}${status.model ? ` (model: ${status.model})` : ""}`] };
    }
    const provider = parseProvider(command.args[0]);
    const model = command.args[1];
    if (!provider) {
      return { lines: ["Usage: /provider <openai|anthropic> [model]"] };
    }
    providerManager.setProvider(provider);
    if (model) providerManager.setModel(model);
    return { lines: [`Active provider set to ${provider}${model ? ` (model: ${model})` : ""}.`] };
  }

  if (command.name === "connect") {
    const provider = parseProvider(command.args[0]) ?? providerManager.getStatus().provider;
    const maybeKey = command.args[1];
    if (maybeKey) {
      providerManager.setApiKey(provider, maybeKey);
    }
    const status = await providerManager.connect(provider);
    if (status.state === "connected") {
      return {
        lines: [
          `Connected: ${status.provider}`,
          `Model: ${status.model ?? "default"}`,
        ],
      };
    }
    return { lines: [`Connection failed: ${status.message ?? "unknown error"}`] };
  }

  if (command.name === "disconnect") {
    await providerManager.disconnect();
    return { lines: ["Disconnected provider."] };
  }

  if (command.name === "models") {
    const provider = parseProvider(command.args[0]) ?? providerManager.getStatus().provider;
    try {
      const models = await providerManager.listModels(provider);
      if (models.length === 0) {
        return { lines: [`No models found for ${provider}.`] };
      }
      return {
        lines: [
          `Models for ${provider}:`,
          ...models.map((model) => `  - ${model.id} (${model.name})`),
        ],
      };
    } catch (error) {
      return {
        lines: [
          `Unable to list models for ${provider}: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  if (command.name === "sessions") {
    if (!context?.sessionManager) {
      return { lines: ["Session management is disabled."] };
    }

    try {
      const sessions = await context.sessionManager.getRecentSessions(10);
      if (sessions.length === 0) {
        return { lines: ["No sessions found."] };
      }

      return {
        lines: [
          "Recent sessions:",
          ...sessions.map((session) => {
            const title = session.metadata.title ?? "(untitled)";
            const messageCount = session.metadata.totalMessages ?? session.messages.length;
            const createdAt = new Date(session.metadata.createdAt).toISOString();
            return `${session.id} | ${session.state} | ${title} | messages: ${messageCount} | created: ${createdAt}`;
          }),
        ],
      };
    } catch (error) {
      return {
        lines: [
          `Unable to list sessions: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  return { lines: ["Unknown command."] };
}
