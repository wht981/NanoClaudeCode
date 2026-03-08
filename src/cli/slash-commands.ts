export type SlashCommandName =
  | "help"
  | "exit"
  | "clear"
  | "status"
  | "provider"
  | "connect"
  | "disconnect"
  | "models"
  | "sessions";

export interface SlashCommandMeta {
  name: SlashCommandName;
  usage: string;
  description: string;
}

export interface SlashCommand {
  name: SlashCommandName;
  args: string[];
}

const COMMANDS: SlashCommandMeta[] = [
  { name: "help", usage: "/help", description: "Show command help" },
  { name: "status", usage: "/status", description: "Show runtime and provider status" },
  { name: "provider", usage: "/provider <openai|anthropic> [model]", description: "Set active provider and optional model" },
  { name: "connect", usage: "/connect [openai|anthropic] [apiKey]", description: "Connect to provider (uses env key if apiKey omitted)" },
  { name: "disconnect", usage: "/disconnect", description: "Disconnect active provider" },
  { name: "models", usage: "/models [openai|anthropic]", description: "List available models" },
  { name: "sessions", usage: "/sessions", description: "List recent sessions" },
  { name: "clear", usage: "/clear", description: "Clear screen/chat" },
  { name: "exit", usage: "/exit", description: "Exit application" },
];

export function parseSlashCommand(input: string): SlashCommand | null {
  if (!input.startsWith("/")) {
    return null;
  }

  const parts = input.slice(1).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const [name, ...args] = parts;
  if (COMMANDS.some((command) => command.name === name)) {
    return { name: name as SlashCommandName, args };
  }

  return null;
}

export function getSlashHelp(): string {
  return [
    "Available slash commands:",
    ...COMMANDS.map((command) => `  ${command.usage.padEnd(34)} ${command.description}`),
  ].join("\n");
}

export function suggestSlashCommands(input: string): SlashCommandMeta[] {
  const normalized = input.replace(/^\//, "").toLowerCase().trim();
  if (!normalized) {
    return COMMANDS;
  }
  return COMMANDS.filter((command) => command.name.startsWith(normalized));
}

export function listSlashCommands(): SlashCommandMeta[] {
  return [...COMMANDS];
}
