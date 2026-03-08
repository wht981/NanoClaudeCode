import * as blessed from "blessed";

export class ChatPanel {
  private readonly log: blessed.Widgets.Log;
  private readonly screen: blessed.Widgets.Screen;

  /**
   * All committed lines stored in order. We use setContent() to render
   * the full chat, which avoids the setLine() multi-line duplication bug.
   */
  private lines: string[] = [];

  /** Whether we're currently streaming */
  private isStreaming = false;
  /** Accumulated text for the current streaming message */
  private streamingBuffer = "";
  /** Prefix (timestamp + role tag) for the current streaming message */
  private streamingPrefix = "";

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;
    this.log = blessed.log({
      parent: screen,
      top: 2,
      left: 0,
      right: 0,
      bottom: 3,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      padding: { left: 1, right: 1 },
      style: {
        bg: "#1c1c1c",
        fg: "#bcbcbc",
      },
      scrollbar: {
        ch: "█",
        track: { bg: "#1c1c1c" },
        style: { bg: "#585858", fg: "#585858" },
      },
    });
  }

  private stamp(): string {
    const now = new Date();
    return now.toTimeString().slice(0, 8);
  }

  /** Escape blessed tag syntax in user/AI content to prevent injection */
  private escapeTags(text: string): string {
    return text.replace(/\{/g, "{{").replace(/\}/g, "}}");
  }

  /**
   * Re-render the entire log content from the lines array plus any
   * in-progress streaming line. This avoids setLine() issues with
   * multi-line content.
   */
  private render(): void {
    const allLines = [...this.lines];
    if (this.isStreaming) {
      const safeText = this.escapeTags(this.streamingBuffer);
      allLines.push(`${this.streamingPrefix}${safeText}▍{/#bcbcbc-fg}`);
    }
    this.log.setContent(allLines.join("\n"));
    // Scroll to bottom
    this.log.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Add a committed line and re-render.
   */
  private addLine(line: string): void {
    this.lines.push(line);
    this.render();
  }

  /**
   * User message — rendered with gray background (#262626) as a distinct block.
   * The entire line gets a gray background to visually separate user input.
   */
  appendUser(text: string): void {
    const ts = `{#585858-fg}${this.stamp()}{/#585858-fg}`;
    const label = `{#5fafaf-fg}{bold}▸ you{/bold}{/#5fafaf-fg}`;
    const safe = this.escapeTags(text);
    // Wrap entire line in gray background
    this.addLine(`{#262626-bg}${ts} ${label} {#bcbcbc-fg}${safe}{/#bcbcbc-fg}{/#262626-bg}`);
  }

  appendAssistant(text: string): void {
    const ts = `{#585858-fg}${this.stamp()}{/#585858-fg}`;
    const label = `{#5faf5f-fg}{bold}▸ ai{/bold}{/#5faf5f-fg}`;
    const safe = this.escapeTags(text);
    this.addLine(`${ts} ${label} {#bcbcbc-fg}${safe}{/#bcbcbc-fg}`);
  }

  appendSystem(text: string): void {
    const ts = `{#585858-fg}${this.stamp()}{/#585858-fg}`;
    const label = `{#d7af5f-fg}{bold}▸ sys{/bold}{/#d7af5f-fg}`;
    const safe = this.escapeTags(text);
    this.addLine(`${ts} ${label} {#bcbcbc-fg}${safe}{/#bcbcbc-fg}`);
  }

  /**
   * Display a tool execution event — shows tool name and brief status.
   */
  appendToolCall(toolName: string, status: "running" | "done" | "error", detail?: string): void {
    const ts = `{#585858-fg}${this.stamp()}{/#585858-fg}`;
    const icon = status === "running" ? "⟳" : status === "done" ? "✓" : "✗";
    const color = status === "running" ? "#d7af5f" : status === "done" ? "#5faf5f" : "#d75f5f";
    const safeDetail = detail ? ` ${this.escapeTags(detail)}` : "";
    this.addLine(`${ts} {${color}-fg}{bold}${icon} ${toolName}{/bold}{/${color}-fg}{#585858-fg}${safeDetail}{/#585858-fg}`);
  }

  /**
   * Begin a streaming assistant message.
   */
  beginStream(): void {
    this.streamingPrefix = `{#585858-fg}${this.stamp()}{/#585858-fg} {#5faf5f-fg}{bold}▸ ai{/bold}{/#5faf5f-fg} {#bcbcbc-fg}`;
    this.streamingBuffer = "";
    this.isStreaming = true;
    this.render();
  }

  /**
   * Append a text chunk to the currently-streaming message.
   */
  appendStreamChunk(chunk: string): void {
    if (!this.isStreaming) return;
    this.streamingBuffer += chunk;
    this.render();
  }

  /**
   * Finalize the streaming message — commit it to the lines array.
   */
  endStream(): void {
    if (!this.isStreaming) return;
    const safeText = this.escapeTags(this.streamingBuffer);
    const finalLine = `${this.streamingPrefix}${safeText}{/#bcbcbc-fg}`;
    this.lines.push(finalLine);
    this.isStreaming = false;
    this.streamingBuffer = "";
    this.streamingPrefix = "";
    this.render();
  }

  clear(): void {
    this.lines = [];
    this.isStreaming = false;
    this.streamingBuffer = "";
    this.streamingPrefix = "";
    this.log.setContent("");
    this.screen.render();
  }
}
