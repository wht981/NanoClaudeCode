import * as blessed from "blessed";
import { ChatPanel } from "./chat";
import { executeSlashCommand } from "../cli/command-runtime";
import { getSlashHelp, parseSlashCommand, suggestSlashCommands } from "../cli/slash-commands";
import { AgenticLoop } from "../loop/agentic";
import type { AgenticStreamEvent } from "../loop/agentic";
import type { ConfirmationRequest, ConfirmationResponse } from "../security/confirmation";
import { bootstrapRuntime } from "../runtime/bootstrap";
import { loopMessageToMessage, messageToLoopMessage, type LoopMessage } from "../adapters/message";

/**
 * Workaround for blessed's color cache pollution bug.
 * During ccolors initialization, blessed temporarily truncates its vcolors
 * array to 8 entries and runs match() against all 256 colors. This caches
 * wrong 8-color mappings for hex values (e.g. #4e4e4e → 0 instead of 239).
 * We clear the cache at module load so subsequent hex lookups are correct.
 */
function clearBlessedColorCache(): void {
  try {
    // Access blessed's internal colors module through the exported object
    const colors = (blessed as Record<string, unknown>).colors as Record<string, unknown> | undefined;
    if (colors?._cache) {
      colors._cache = {};
    }
  } catch {
    // Non-critical: if we can't clear, hex colors may map incorrectly
  }
}
clearBlessedColorCache();

/**
 * System prompt that configures the AI assistant with Claude Code-like capabilities.
 */
const SYSTEM_PROMPT = `You are NanoClaudecode, a powerful AI coding assistant running in a terminal interface.
Your working directory is: ${process.cwd()}

You have access to tools that let you interact with the user's local development environment:

**File Operations** (tool: file)
- read_file: Read file contents
- write_file: Write content to files (creates directories automatically)
- list_directory: List files and directories at a given path
- delete_file: Delete files

**Search** (tool: search)
- glob: Find files matching patterns (e.g. "**/*.ts")
- grep: Search file contents for text or regex patterns

**Shell** (tool: shell)
- Execute shell commands with timeout and security validation
- IMPORTANT: Each command runs in a separate subprocess. \`cd\` does NOT persist between commands.
- To run a command in a specific directory, use the \`cwd\` argument instead of \`cd\`.
- On Windows, commands run via \`cmd /c\`. Use Windows-compatible commands (e.g. \`dir\` not \`ls\`, \`cd\` prints cwd on Windows).

**Git** (tool: git)
- status, diff, log, commit, branch, checkout

**Web** (tool: web)
- fetch: GET request to a URL
- scrape: Extract text from HTML pages

## Behavior Guidelines

1. **Be concise** — Give direct answers, avoid unnecessary preamble.
2. **Read before writing** — Always read a file before modifying it to understand context.
3. **Explain changes** — Briefly explain what you're doing and why.
4. **Use tools proactively** — When the user asks about code, read the relevant files first.
5. **Error handling** — If a tool fails, explain the error and suggest alternatives.
6. **Safety first** — Never execute destructive commands without warning the user.
7. **Use list_directory** to see what's in a directory rather than shell \`ls\` or \`dir\`.
8. **Platform awareness** — Detect the platform from the working directory path and use platform-appropriate commands.

When responding, provide clear and helpful answers. Use markdown formatting for code blocks. Keep responses focused and actionable.`;

export async function startTui(): Promise<void> {
  const runtime = await bootstrapRuntime({
    confirmationHandler: async (request: ConfirmationRequest): Promise<ConfirmationResponse> => {
      const { riskLevel } = request;
      if (riskLevel === "low" || riskLevel === "medium") {
        return {
          approved: true,
          timestamp: new Date(),
          reason: `Auto-approved: ${riskLevel} risk operation`,
        };
      }

      return {
        approved: false,
        timestamp: new Date(),
        reason: "Auto-denied: HIGH/CRITICAL risk requires manual approval (dialog not yet implemented)",
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

  const conversationHistory: LoopMessage[] = [];
  let currentSessionId: string | undefined;

  if (sessionManager) {
    try {
      const recentSessions = await sessionManager.getRecentSessions(1);
      if (recentSessions.length > 0) {
        const latestSession = recentSessions[0];
        if (!latestSession) {
          throw new Error("Unable to resolve latest session");
        }
        await sessionManager.setCurrentSession(latestSession.id);
        currentSessionId = latestSession.id;
        for (const message of latestSession.messages) {
          conversationHistory.push(messageToLoopMessage(message));
        }
      } else {
        const created = await sessionManager.createSession();
        currentSessionId = created.id;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Session initialization failed: ${message}`);
      currentSessionId = undefined;
      conversationHistory.length = 0;
    }
  }

  let isGenerating = false;

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    autoPadding: false,
    dockBorders: false,
    terminal: "xterm-256color",
    title: "NanoClaudecode",
    resizeTimeout: 300,
    style: { bg: "#1c1c1c", fg: "#bcbcbc" },
  });

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    style: { bg: "#1c1c1c" },
  });

  // Title bar — dark gray strip across top
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: {
      bg: "#262626",
      fg: "#bcbcbc",
    },
    content: " {#d7af5f-fg}{bold}NANOCLAUDECODE{/bold}{/#d7af5f-fg} {#585858-fg}│{/#585858-fg} {#d7af5f-fg}ctrl+c{/#d7af5f-fg} {#585858-fg}quit{/#585858-fg} {#585858-fg}│{/#585858-fg} {#5fafaf-fg}/help{/#5fafaf-fg} {#585858-fg}commands{/#585858-fg} {#585858-fg}│{/#585858-fg} {#5faf5f-fg}/connect{/#5faf5f-fg} {#585858-fg}quick-connect{/#585858-fg}",
  });

  const chat = new ChatPanel(screen);

  // Input box — single row, dark gray bg, left accent border
  const input = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    padding: { left: 1, right: 1 },
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: {
      bg: "#262626",
      fg: "#bcbcbc",
      focus: { bg: "#303030", fg: "#bcbcbc" },
    },
  });

  // Status + hints merged into 2 rows above input
  const statusLine = blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: {
      bg: "#1c1c1c",
      fg: "#bcbcbc",
    },
    content: "",
  });

  const commandHint = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: {
      bg: "#1c1c1c",
      fg: "#bcbcbc",
    },
    content: " {#585858-fg}Type{/#585858-fg} {#5fafaf-fg}/help{/#5fafaf-fg} {#585858-fg}for commands{/#585858-fg} {#5faf5f-fg}/status{/#5faf5f-fg} {#5faf5f-fg}/provider{/#5faf5f-fg} {#5faf5f-fg}/connect{/#5faf5f-fg}",
  });

  const exit = async (): Promise<void> => {
    try {
      await cleanup();
    } finally {
      screen.destroy();
      process.exit(0);
    }
  };

  const setStatusFromProvider = (): void => {
    const state = providerManager.getStatus();
    const stateLabel =
      state.state === "connected"
        ? "{#5faf5f-fg}{bold}ONLINE{/bold}{/#5faf5f-fg}"
        : state.state === "connecting"
          ? "{#d7af5f-fg}{bold}SYNCING{/bold}{/#d7af5f-fg}"
          : state.state === "error"
            ? "{#d75f5f-fg}{bold}ERROR{/bold}{/#d75f5f-fg}"
            : "{#585858-fg}OFFLINE{/#585858-fg}";
    const msg = state.message ?? "ready";
    const truncate = (text: string, max: number): string =>
      text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
    const width = Math.max(20, Number(screen.width) - 8);
    statusLine.setContent(` ${stateLabel} {#585858-fg}│{/#585858-fg} {#585858-fg}${state.provider}{/#585858-fg} {#585858-fg}│{/#585858-fg} {#585858-fg}${state.model ?? "no-model"}{/#585858-fg} {#585858-fg}│{/#585858-fg} {#585858-fg}${truncate(msg, Math.max(8, width - 50))}{/#585858-fg}`);
  };

  providerManager.onStatusChange(() => {
    setStatusFromProvider();
    screen.render();
  });

  /**
   * Handle a user message by sending it through the AgenticLoop,
   * which supports tool calls in a ReAct loop.
   */
  const handleLine = async (line: string): Promise<void> => {
    const text = line.trim();
    if (!text) return;

    const command = parseSlashCommand(text);
    if (command) {
      const result = await executeSlashCommand(command, providerManager, { sessionManager });
      if (result.shouldClear) {
        chat.clear();
      }
      for (const lineOutput of result.lines) {
        chat.appendSystem(lineOutput);
      }
      if (command.name === "help") {
        chat.appendSystem(getSlashHelp());
      }
      if (result.shouldExit) {
        await exit();
        return;
      }
      setStatusFromProvider();
      screen.render();
      return;
    }

    if (text === "/") {
      chat.appendSystem(getSlashHelp());
      setStatusFromProvider();
      screen.render();
      return;
    }

    // --- Normal user message: send to LLM via AgenticLoop ---
    chat.appendUser(text);

    const providerStatus = providerManager.getStatus();
    if (providerStatus.state !== "connected") {
      chat.appendSystem("Provider not connected. Use /connect to connect first.");
      setStatusFromProvider();
      screen.render();
      return;
    }

    const provider = providerManager.getActiveProvider();
    if (!provider) {
      chat.appendSystem("No active provider instance. Use /connect to connect.");
      setStatusFromProvider();
      screen.render();
      return;
    }

    if (isGenerating) {
      chat.appendSystem("Already generating a response. Please wait.");
      screen.render();
      return;
    }

    isGenerating = true;

    const model = providerStatus.model ?? config.model ?? "gpt-4o-mini";

    try {
      // Create an AgenticLoop for this request
      const loop = new AgenticLoop({
        provider,
        executor,
        model,
        tools,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations: config.maxIterations,
        maxConsecutiveErrors: config.maxConsecutiveErrors,
        toolTimeoutMs: config.toolTimeoutMs,
        hooks,
        contextManager: contextManager ?? undefined,
      });

      // Stream events from the agentic loop
      let hasStartedStream = false;
      let fullResponse = "";
      const persistedHistoryLength = conversationHistory.length + 1;

      const eventStream = loop.stream({
        input: text,
        history: conversationHistory,
      });

      for await (const event of eventStream as AsyncIterable<AgenticStreamEvent>) {
        switch (event.type) {
          case "reason":
            // AI text chunk — stream it
            if (!hasStartedStream) {
              chat.beginStream();
              hasStartedStream = true;
            }
            fullResponse += event.content;
            chat.appendStreamChunk(event.content);
            break;

          case "act":
            // Tool is about to be called — end any current stream first
            if (hasStartedStream) {
              chat.endStream();
              hasStartedStream = false;
            }
            chat.appendToolCall(event.toolName, "running", truncateArgs(event.args));
            break;

          case "observe": {
            // Tool returned a result
            const status = event.result.success ? "done" : "error";
            const detail = event.result.success
              ? truncateOutput(event.result.output)
              : event.result.error ?? "unknown error";
            chat.appendToolCall(event.toolName, status, detail);
            break;
          }

          case "error":
            if (hasStartedStream) {
              chat.endStream();
              hasStartedStream = false;
            }
            chat.appendSystem(`Error (iteration ${event.iteration}): ${event.error}`);
            break;

          case "final":
            if (hasStartedStream) {
              chat.endStream();
              hasStartedStream = false;
            }
            if (sessionManager && currentSessionId) {
              try {
                for (const loopMessage of event.result.history.slice(persistedHistoryLength)) {
                  const message = loopMessageToMessage(loopMessage, currentSessionId);
                  await sessionManager.addMessage(currentSessionId, message);
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                chat.appendSystem(`Session persistence failed: ${message}`);
              }
            }
            if (event.result.error) {
              chat.appendSystem(`Loop ended: ${event.result.error}`);
            }
            // Use the final output if we didn't capture it via streaming
            if (!fullResponse && event.result.output) {
              chat.appendAssistant(event.result.output);
              fullResponse = event.result.output;
            }
            conversationHistory.length = 0;
            for (const message of event.result.history) {
              if (message.role !== "system") {
                conversationHistory.push(message);
              }
            }
            break;
        }
      }
    } catch (error: unknown) {
      chat.endStream();
      const errorMsg = error instanceof Error ? error.message : String(error);
      chat.appendSystem(`Error: ${errorMsg}`);

      // Don't save failed requests to history
    } finally {
      isGenerating = false;
    }

    setStatusFromProvider();
    screen.render();
  };

  input.on("keypress", () => {
    const value = input.getValue().trim();
    if (value.startsWith("/")) {
      const suggestions = suggestSlashCommands(value);
      if (suggestions.length > 0) {
        const visible = suggestions.slice(0, 6);
        const suffix = suggestions.length > visible.length ? "  {#585858-fg}…{/#585858-fg}" : "";
        commandHint.setContent(` {#bcbcbc-fg}Commands:{/#bcbcbc-fg} {#5fafaf-fg}${visible.map((item) => `/${item.name}`).join("  ")}{/#5fafaf-fg}${suffix} `);
      } else {
        commandHint.setContent(" {#d75f5f-fg}Unknown command.{/#d75f5f-fg} {#bcbcbc-fg}Use{/#bcbcbc-fg} {#5fafaf-fg}/help{/#5fafaf-fg} {#bcbcbc-fg}to list valid commands.{/#bcbcbc-fg} ");
      }
    } else {
      commandHint.setContent(" {#bcbcbc-fg}Message mode. Press Enter to send. Use{/#bcbcbc-fg} {#5fafaf-fg}/help{/#5fafaf-fg} {#bcbcbc-fg}for command mode.{/#bcbcbc-fg} ");
    }
    screen.render();
  });

  input.on("submit", async (value: string) => {
    input.clearValue();
    await handleLine(value);
    input.focus();
  });

  screen.key(["escape", "q", "C-c"], () => {
    void exit();
  });
  screen.key(["C-l"], () => {
    chat.clear();
    conversationHistory.length = 0;
    chat.appendSystem("Feed and conversation history cleared. Type /help for commands.");
    screen.render();
  });
  screen.on("resize", () => screen.render());

  chat.appendSystem("NanoClaudecode TUI started.");
  chat.appendSystem("Use /help to discover commands. Ctrl+L clears feed. Ctrl+C exits.");
  setStatusFromProvider();

  input.focus();
  screen.render();
}

/**
 * Truncate tool arguments for display in the chat.
 */
function truncateArgs(args: Record<string, unknown>): string {
  const str = JSON.stringify(args);
  if (str.length <= 80) return str;
  return str.slice(0, 77) + "...";
}

/**
 * Truncate tool output for display in the chat.
 */
function truncateOutput(output: string): string {
  const firstLine = output.split("\n")[0] ?? "";
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + "...";
}
