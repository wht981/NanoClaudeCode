import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { startTui } from "../tui/index";
import { executeSlashCommand } from "./command-runtime";
import { getSlashHelp, parseSlashCommand, suggestSlashCommands } from "./slash-commands";
import { AgenticLoop, type AgenticStreamEvent } from "../loop/agentic";
import { loopMessageToMessage, messageToLoopMessage, type LoopMessage } from "../adapters/message";
import type { ConfirmationRequest, ConfirmationResponse } from "../security/confirmation";
import { bootstrapRuntime } from "../runtime/bootstrap";

const VERSION = "0.1.0";

interface CliFlags {
  help: boolean;
  version: boolean;
  tui: boolean;
  prompt?: string;
  session?: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { help: false, version: false, tui: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--version" || arg === "-v") flags.version = true;
    else if (arg === "--tui") flags.tui = true;
    else if (arg === "--prompt" && i + 1 < argv.length) {
      flags.prompt = argv[i + 1];
      i += 1;
    } else if (arg === "--session" && i + 1 < argv.length) {
      flags.session = argv[i + 1];
      i += 1;
    }
  }

  return flags;
}

function printHelp(): void {
  console.log([
    "NanoClaudecode CLI",
    "",
    "Usage:",
    "  bun run src/index.ts [--tui] [--prompt \"text\"] [--session \"id\"] [--help] [--version]",
    "",
    "Flags:",
    "  --help, -h      Show help",
    "  --version, -v   Show version",
    "  --tui           Launch Blessed TUI mode",
    "  --prompt        Run one-shot prompt in plain CLI mode",
    "  --session       Resume an existing session by ID",
    "",
    getSlashHelp(),
  ].join("\n"));
}

function getRuntimeStatus(): string {
  const providerEnv = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"].filter((k) => Boolean(process.env[k]));
  return [
    `Version: ${VERSION}`,
    `Node: ${process.version}`,
    `CWD: ${process.cwd()}`,
    `Providers configured: ${providerEnv.length > 0 ? providerEnv.join(", ") : "none"}`,
  ].join("\n");
}

async function runPlainCli(oneShotPrompt?: string, sessionId?: string): Promise<void> {
  const runtime = await bootstrapRuntime({
    confirmationHandler: async (request: ConfirmationRequest): Promise<ConfirmationResponse> => {
      const { operation, description, riskLevel } = request;
      console.log(`\n⚠️  Security Confirmation Required:`);
      console.log(`   Operation: ${operation}`);
      console.log(`   Description: ${description}`);
      console.log(`   Risk Level: ${riskLevel.toUpperCase()}`);

      if (riskLevel === "low" || riskLevel === "medium") {
        console.log(`   ✓ Auto-approved (${riskLevel} risk)\n`);
        return {
          approved: true,
          timestamp: new Date(),
          reason: `Auto-approved: ${riskLevel} risk operation`,
        };
      }

      const rlTemp = createInterface({ input, output });
      const answer = await rlTemp.question("   Approve? (y/n): ");
      rlTemp.close();

      const approved = answer.trim().toLowerCase() === "y";
      console.log(approved ? "   ✓ Approved\n" : "   ✗ Denied\n");

      return {
        approved,
        timestamp: new Date(),
        reason: approved ? "User approved" : "User declined",
        userInput: answer.trim(),
      };
    },
  });

  const {
    config,
    providerManager,
    executor,
    tools,
    hooks,
    contextManager,
    sessionManager,
    cleanup,
  } = runtime;

  let currentSessionId: string | undefined;
  let sessionHistory: LoopMessage[] = [];

  if (config.enableSessions) {
    try {
      if (sessionId) {
        if (!sessionManager) {
          throw new Error("Session manager is not available");
        }
        const resumed = await sessionManager.setCurrentSession(sessionId);
        if (!resumed) {
          console.error(`Unable to resume session: ${sessionId}. Starting a new session.`);
          const created = await sessionManager.createSession();
          currentSessionId = created.id;
        } else {
          const currentSession = sessionManager.getCurrentSession();
          if (currentSession) {
            currentSessionId = currentSession.id;
            sessionHistory = currentSession.messages.map((message) => messageToLoopMessage(message));
          }
        }
      } else {
        if (!sessionManager) {
          throw new Error("Session manager is not available");
        }
        const created = await sessionManager.createSession();
        currentSessionId = created.id;
      }
    } catch (error) {
      console.error(`Session initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      currentSessionId = undefined;
      sessionHistory = [];
    }
  }

  const initialStatus = providerManager.getStatus();
  if (initialStatus.state !== "connected") {
    console.log(`Provider not connected: ${initialStatus.message}`);
    console.log("Tip: use /connect [openai|anthropic] [apiKey] to connect.");
  }

  // Register SIGINT handler for graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down...');
    cleanup().then(() => {
      process.exit(0);
    }).catch(() => {
      process.exit(1);
    });
  });
  if (oneShotPrompt) {
    let exitCode = 1;
    try {
      const provider = providerManager.getActiveProvider();
      if (!provider) {
        console.error("✗ Error: No provider connected. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
        await cleanup();
        process.exit(1);
      }

      const model = config.model || "claude-3-5-sonnet-20241022";
      const cwd = process.cwd();

      // Create loop
      const loop = new AgenticLoop({
        provider,
        executor,
        model,
        tools,
        systemPrompt: `You are NanoClaudecode, a powerful AI coding assistant. Your working directory is: ${cwd}`,
        maxIterations: config.maxIterations,
        maxConsecutiveErrors: config.maxConsecutiveErrors,
        toolTimeoutMs: config.toolTimeoutMs,
        hooks,
        contextManager: contextManager ?? undefined,
      });

      // Stream execution
      console.log(`\nUser: ${oneShotPrompt}\n`);
      const eventStream = loop.stream({
        input: oneShotPrompt,
        history: sessionHistory,
      });

      const persistedHistoryLength = sessionHistory.length;
      let done = false;
      for await (const event of eventStream as AsyncIterable<AgenticStreamEvent>) {
        switch (event.type) {
          case "reason":
            process.stdout.write(event.content);
            break;
          case "final":
            console.log("\n");
            if (sessionManager && currentSessionId) {
              void (async () => {
                try {
                  for (const loopMessage of event.result.history.slice(persistedHistoryLength)) {
                    const message = loopMessageToMessage(loopMessage, currentSessionId);
                    await sessionManager.addMessage(currentSessionId, message);
                  }
                } catch (error) {
                  console.error(`Session persistence failed: ${error instanceof Error ? error.message : String(error)}`);
                }
              })();
            }
            if (event.result.success) {
              console.log("✓ Task completed successfully");
              exitCode = 0;
            } else {
              console.error(`✗ Error: ${event.result.error || "Unknown error"}`);
              exitCode = 1;
            }
            done = true;
            break;
          case "error":
            console.error(`\n✗ Error: ${event.error}`);
            exitCode = 1;
            done = true;
            break;
        }

        if (done) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ Fatal error: ${message}`);
      exitCode = 1;
    }

    await cleanup();
    process.exit(exitCode);
    return;
  }

  const rl = createInterface({ input, output });
  console.log("NanoClaudecode (plain mode). Type /help for commands.");

  let running = true;
  while (running) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;

    if (line.startsWith("/") && line.length > 1) {
      const suggestions = suggestSlashCommands(line);
      if (suggestions.length > 0) {
        console.log(`Hint: ${suggestions.map((item) => `/${item.name}`).join("  ")}`);
      }
    }

    const command = parseSlashCommand(line);
    if (command) {
      const result = await executeSlashCommand(command, providerManager, { sessionManager });
      if (result.shouldClear) console.clear();
      for (const outputLine of result.lines) {
        console.log(outputLine);
      }
      if (command.name === "status") {
        console.log(getRuntimeStatus());
      }
      if (result.shouldExit) {
        running = false;
      }
      continue;
    }

    if (line === "/") {
      console.log(getSlashHelp());
      continue;
    }

    if (line.startsWith("/")) {
      console.log("Unknown command. Type /help to see available commands.");
      continue;
    }

    console.log(`You: ${line}`);
    console.log("Assistant: Message received. Provider-backed loop integration pending.");
  }

  rl.close();
  await cleanup();
}

export async function runCli(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);

  if (flags.help) {
    printHelp();
    return;
  }
  if (flags.version) {
    console.log(VERSION);
    return;
  }
  if (flags.tui) {
    await startTui();
    return;
  }

  await runPlainCli(flags.prompt, flags.session);
}
