# NanoClaudecode Development Guide

## 1. Project Overview

NanoClaudecode is an enterprise-oriented AI coding assistant built with Bun + TypeScript.
Current codebase already includes most core runtime capabilities:

- LLM provider abstraction and concrete providers (Anthropic/OpenAI)
- Built-in tool system (file/shell/search/git/web/lsp)
- Agentic ReAct loop for tool-augmented reasoning
- Multi-agent core (base agent + orchestrator + message bus + specialized agents)
- MCP client wrapper and transport layer
- Session persistence with SQLite (`better-sqlite3`)
- Security layer (confirmation, sandbox, audit)

The repository is currently in a "runnable core + incremental integration" state. A minimal CLI/TUI entry has been added under `src/index.ts`.

---

## 2. Tech Stack

- Runtime: Bun
- Language: TypeScript (strict mode)
- Lint/Format: Biome
- Persistence: SQLite (`better-sqlite3`)
- AI SDKs:
  - `@anthropic-ai/sdk`
  - `openai`
  - `@modelcontextprotocol/sdk`
- TUI library installed: `blessed`

### Key scripts (`package.json`)

```json
{
  "dev": "bun run --watch src/index.ts",
  "build": "bun build src/index.ts --outdir dist",
  "typecheck": "tsc --noEmit",
  "test": "bun test",
  "test:coverage": "bun test --coverage",
  "lint": "biome lint src/",
  "format": "biome format src/ --write"
}
```

> Note: runtime scripts now work with `src/index.ts`.

---

## 3. Repository Structure

```txt
src/
  agents/        # BaseAgent, orchestrator, message bus, specialized agents
  context/       # Context/token management
  loop/          # Agentic ReAct loop
  mcp/           # MCP client + transports
  providers/     # LLM provider base + Anthropic/OpenAI implementations
  security/      # confirmation/sandbox/audit
  session/       # SQLite session persistence
  tools/         # tool base/registry/executor + built-in tools
  types/         # shared type system
  __tests__/     # framework-level tests
tests/           # additional integration-style tests
```

Generated and planning artifacts:

```txt
.sisyphus/
  plans/
  drafts/
  evidence/
  notepads/
```

---

## 4. Module-by-Module Design

### 4.1 Type System (`src/types`)

Primary export hub: `src/types/index.ts`

Major domains:

- LLM: model metadata, usage, completion options, streaming chunks
- Tool: JSON Schema-based tool contracts
- Agent: lifecycle/config/capabilities/result contracts
- Message: conversation message model
- Session: session lifecycle and storage interface
- Config: layered config types
- Context: token windows, pruning strategies
- MCP: tool/resource/prompt/client interfaces

Design intent:

- Keep cross-module contracts centralized and explicit
- Preserve provider/tool/agent decoupling through interfaces

---

### 4.2 Providers (`src/providers`)

- `base.ts`: abstract provider behavior
  - retry/backoff
  - rate limiting
  - error normalization
- `claude.ts`: Anthropic integration
- `openai.ts`: OpenAI integration

Expected call shape:

1. Build normalized completion request
2. Execute via concrete SDK
3. Map SDK result to internal response contract
4. Handle tool calls + streaming chunks consistently

---

### 4.3 Tool Runtime (`src/tools`)

Core runtime:

- `base.ts`: base tool class
- `registry.ts`: register/discover tools
- `executor.ts`: validate + execute + result envelope

Built-in tools:

- `file.ts`
- `shell.ts`
- `search.ts`
- `git.ts`
- `web.ts`
- `lsp.ts`

Security boundaries in tool layer:

- file path validation
- shell timeout/danger command checks
- bounded search output

---

### 4.4 Agentic Loop (`src/loop/agentic.ts`)

Implements ReAct-like orchestration:

1. `Reason`: provider emits content/tool calls
2. `Act`: dispatch tool calls through `ToolExecutor`
3. `Observe`: append tool results as messages
4. Continue until final response or iteration/error guard

Guard rails:

- `maxIterations`
- `maxConsecutiveErrors`
- tool argument parsing/validation

Supports both:

- `run()` (non-stream)
- `stream()` (event stream: reason/act/observe/error/final)

---

### 4.5 Context Management (`src/context/manager.ts`)

Responsibilities:

- track token usage
- enforce context-window limits
- pruning strategies (truncate/summarize-style flow)
- preserve high-priority messages (system/recent/tool-critical)

Use this layer before every provider call to avoid context overflow.

---

### 4.6 Agent System (`src/agents`)

Core:

- `base.ts`: agent lifecycle (initialize/execute/stream/cleanup)
- `message-bus.ts`: event-based agent communication
- `orchestrator.ts`: coordination and routing

Specialized agents present:

- `coder.ts`
- `reviewer.ts`
- `researcher.ts`
- `planner.ts`
- `tester.ts`

These are role-specialized wrappers on top of the same provider/tool interfaces, enabling orchestration-level composition.

---

### 4.7 MCP Integration (`src/mcp`)

- `transports.ts`: transport factory (stdio/http)
- `client.ts`: wrapper over MCP SDK Client

Capabilities exposed:

- connect/disconnect lifecycle
- list/read resources
- list/call tools
- list/get prompts

Current known issue:

- one failing lifecycle test around disconnect behavior when not connected

---

### 4.8 Session Persistence (`src/session`)

- `schema.ts`: DDL + migrations + schema versioning helpers
- `database.ts`: SQLite adapter (`SessionDatabase`)
- `manager.ts`: session runtime API (current session, CRUD, metadata, archive/export/import)

Data model highlights:

- `sessions` table: session metadata/state/config context
- `messages` table: role/content/tool-call/token fields
- indexes for state/time/session lookups

---

### 4.9 Security Layer (`src/security`)

- `confirmation.ts`
  - risk levels
  - confirmation request/response model
  - operation wrappers and dangerous operation presets
- `sandbox.ts`
  - command risk assessment
  - timeout and environment constraints
  - optional confirmation gating
- `audit.ts`
  - structured audit event model
  - severity filtering
  - file/console outputs and buffering

`src/security/index.ts` provides initialization helper for shared wiring.

---

## 5. Execution Flow (High-level)

Typical request handling pipeline:

1. Input enters agent/orchestrator
2. Context manager composes bounded message window
3. Agentic loop calls provider
4. Tool calls dispatched via tool executor
5. Observations appended to history
6. Session manager persists conversation + stats
7. Security layer logs/guards sensitive actions
8. Final response emitted to CLI/TUI

---

## 6. Testing Strategy

Current suite uses Bun test runner.

Important test locations:

- `src/providers/*.test.ts`
- `src/tools/*.test.ts`
- `tests/tools.test.ts`, `tests/search.test.ts`
- `src/loop/agentic.test.ts`
- `src/context/manager.test.ts`
- `src/security/__tests__/*.test.ts`
- `src/agents/*.test.ts`
- `src/__tests__/mcp/client.test.ts`

Current status observed:

- Full suite passes (`bun test`): 456 pass / 0 fail
- Typecheck passes (`bun run typecheck`)

---

## 7. Local Development Workflow

### 7.1 Install dependencies

```bash
bun install
```

### 7.2 Type check

```bash
bun run typecheck
```

Typecheck scope is currently focused on runtime source files (`src/**/*.ts`) and excludes test files.

### 7.3 Run tests

```bash
bun test
```

### 7.4 Lint and format

```bash
bun run lint
bun run format
```

---

## 8. Coding Conventions

- TypeScript strict mode is enabled
- Avoid `any` in core contracts and runtime logic
- Keep module boundaries clear by importing from `src/types/*`
- Prefer explicit error classes for boundary failures
- Tool/provider/agent layers should depend on interfaces, not concrete peers

---

## 9. Known Gaps and Follow-up Work

Although core engine is strong, integration layer is not fully wired yet.

Missing or incomplete integration points:

- Provider-backed end-to-end runtime flow from CLI/TUI to agentic loop (currently scaffolded with placeholder assistant responses)
- deeper config/plugin/hooks/skills integration into startup path
- richer e2e tests from CLI -> loop -> tools -> persistence

Recommended order:

1. Wire CLI/TUI input to orchestrator + loop + session managers
2. Inject config/plugin/hooks/skills managers into startup lifecycle
3. Add smoke e2e tests for full request cycle
4. Add provider selection + model fallback strategy in runtime

---

## 10. Quick Troubleshooting

### Build/dev script fails

Symptom:

- `bun run dev` or `bun run build` fails unexpectedly

Cause:

- local environment or dependency mismatch

Fix:

- run `bun install`, then `bun run typecheck`, then `bun run dev`

### Security tests print listener errors

Symptom:

- integration tests may print `Error in audit event listener` messages

Cause:

- tests intentionally register a throwing listener to validate logger resilience

Expected behavior:

- log line appears, test still passes

---

## 11. Suggested Next Milestone (Definition of Done)

A practical milestone to mark v0.2.0:

- `src/index.ts` exists and starts CLI
- CLI can run a minimal agent loop request end-to-end
- session persistence verified in real run
- security hooks invoked on dangerous tool operations
- all tests green (`bun test` 0 fail)
- basic user docs (`README`) updated with run examples

---

## 12. Key File References

- `package.json`
- `tsconfig.json`
- `biome.json`
- `src/types/index.ts`
- `src/loop/agentic.ts`
- `src/session/manager.ts`
- `src/mcp/client.ts`
- `src/security/confirmation.ts`
- `src/security/sandbox.ts`
- `src/security/audit.ts`
- `src/agents/base.ts`
- `src/agents/orchestrator.ts`
- `src/tools/executor.ts`
