# NanoClaudecode

Enterprise AI coding assistant CLI/TUI built with Bun.

## What it does

- Plain CLI and Blessed-based TUI modes.
- Provider runtime management for OpenAI and Anthropic.
- Slash commands for provider setup and runtime control.
- Session/storage, agent modules, and MCP/security building blocks for further integration.

## Requirements

- Bun 1.3+
- One API key:
  - `OPENAI_API_KEY` (for OpenAI)
  - `ANTHROPIC_API_KEY` (for Anthropic)

## Install

```bash
bun install
```

## Quick start

### 1) Run plain CLI

```bash
bun run start
```

### 2) Run TUI mode

```bash
bun run start --tui
```

### 3) One-shot prompt

```bash
bun run start --prompt "hello"
```

## CLI flags

- `--help`, `-h`: show help
- `--version`, `-v`: show version
- `--tui`: launch Blessed TUI
- `--prompt "text"`: run one-shot prompt in plain mode

## Provider setup

### Environment variables (recommended)

```bash
# OpenAI
export OPENAI_API_KEY="your_key"

# Anthropic
export ANTHROPIC_API_KEY="your_key"

# Optional runtime defaults
export NANO_PROVIDER="openai"   # openai | anthropic
export NANO_MODEL="gpt-4o-mini"
```

PowerShell:

```powershell
$env:OPENAI_API_KEY="your_key"
$env:ANTHROPIC_API_KEY="your_key"
$env:NANO_PROVIDER="openai"
$env:NANO_MODEL="gpt-4o-mini"
```

### Runtime commands

You can configure provider/model inside the app without restart:

- `/provider <openai|anthropic> [model]`
- `/connect [openai|anthropic] [apiKey]`
- `/disconnect`
- `/models [openai|anthropic]`
- `/status`

## Slash commands

- `/help` - Show command help
- `/status` - Show runtime and provider status
- `/provider <openai|anthropic> [model]` - Set active provider and optional model
- `/connect [openai|anthropic] [apiKey]` - Connect to provider (env key is used if apiKey omitted)
- `/disconnect` - Disconnect active provider
- `/models [openai|anthropic]` - List available models
- `/clear` - Clear screen/chat
- `/exit` - Exit application

Tips:

- Typing `/` in plain CLI or TUI shows command guidance/suggestions.
- TUI status bar always shows current provider state.

## Development

```bash
bun run dev
```

## Build, typecheck, test

```bash
bun run typecheck
bun run build
bun test
```

Additional test scripts:

- `bun run test:unit`
- `bun run test:integration`
- `bun run test:e2e`
- `bun run test:coverage`

## Troubleshooting

### "Provider not connected"

- Ensure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set.
- Or connect at runtime: `/connect openai <apiKey>`.

### Storage tests skipped on Bun

`better-sqlite3` may not be available in some Bun environments. The storage test suite auto-skips when the adapter is unavailable so the rest of the test suite remains stable.

## Project structure

- `src/cli/` - CLI runtime, slash command parsing/execution
- `src/tui/` - Blessed TUI panels and status UI
- `src/providers/` - OpenAI/Anthropic providers and runtime manager
- `src/session/` - Session manager and SQLite storage
- `src/security/` - Security and audit modules
- `src/mcp/` - MCP client and transport components
