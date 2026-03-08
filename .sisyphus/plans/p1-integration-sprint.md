# P1 Integration Sprint — Module Wiring

## TL;DR

> **Quick Summary**: Wire 7 independently-built but disconnected modules into the main execution flow. The modules are IMPLEMENTED but NOT USED — this sprint connects them.
> 
> **Deliverables**:
> - Security layer active (audit logging + confirmation prompts)
> - Session persistence (SQLite, save/resume conversations)
> - Context management (token-aware pruning prevents overflow)
> - LSP tool registered (code intelligence available)
> - Hooks system wired (extensibility points)
> - Plugin/Skills initialization (framework ready)
> - Feature flags in config (toggle modules on/off)
> 
> **Estimated Effort**: M (integration, not greenfield)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 6

---

## Context

### Current State
- **Typecheck**: 0 errors
- **Tests**: 526 pass, 0 fail
- **Main flow**: CLI → ConfigManager → ProviderManager → AgenticLoop → ToolExecutor → [File, Shell, Search, Git, Web]
- **P0 Complete**: Security fixes (path traversal, command injection, SSRF), biome config, integration/e2e tests

### The Problem
32/33 planned modules are IMPLEMENTED but only 6 are wired into the main flow. The remaining modules are dead code — built but never called. This sprint connects them.

### Critical Discovery: Type Mismatch
- `AgenticLoop` uses `LoopMessage` (from `types/llm.ts`): `{role, content}`
- `SessionManager` expects `Message` (from `types/message.ts`): `{id, role, content, metadata, toolCalls, ...}`
- These are DIFFERENT types. An adapter layer is required before Session can be wired.

### Deferred to P2
- **Agent System** (src/agents/) — Architecture incompatible with current loop (CRITICAL risk)
- **MCP Client** (src/mcp/) — Needs MCPToolAdapter wrapper (MEDIUM risk)  
- **Checkpoint System** (src/checkpoint/) — Empty directory, needs implementation
- **Tech Debt** — 162 lint errors, 36 `as any`, 79 console.log

---

## Work Objectives

### Core Objective
Wire security, sessions, context, hooks, plugins/skills, and LSP into the live execution flow so the application delivers enterprise-grade features.

### Definition of Done
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun test` — 526+ pass, 0 fail
- [ ] Security: audit events logged when tools execute
- [ ] Sessions: conversation persisted to SQLite, resumable
- [ ] Context: token counting active, pruning prevents overflow
- [ ] LSP: tool available to LLM for code intelligence
- [ ] Hooks: events emitted at loop lifecycle points
- [ ] Feature flags: each module toggleable via config

### Must NOT Have (Guardrails)
- ❌ Agent system wiring (P2)
- ❌ MCP client wiring (P2)
- ❌ Checkpoint implementation (P2)
- ❌ Breaking changes to existing tests
- ❌ `as any` additions
- ❌ Auto-approving HIGH/CRITICAL risk operations without handler

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (526 existing tests)
- **Automated tests**: Required for adapter + new integration points
- **Framework**: bun test

### QA Policy
Every task MUST include agent-executed QA:
- `bun run typecheck` — 0 errors
- `bun test` — all pass
- Task-specific acceptance criteria (executable commands)

Evidence saved to `.sisyphus/evidence/p1-task-{N}-{slug}.txt`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — no dependencies, MAX PARALLEL):
├── Task 1: Message Type Adapter [quick]
├── Task 2: Security Integration [unspecified-high]
├── Task 3: Hooks Integration [quick]
├── Task 4: LSP Tool Registration [quick]
└── Task 5: Feature Flags in ConfigManager [quick]

Wave 2 (After Wave 1 — has dependencies):
├── Task 6: Session Integration [deep] (depends: Task 1)
├── Task 7: Plugins/Skills Integration [quick] (depends: Task 3)
└── Task 8: CLI Cleanup Handler [quick] (depends: Task 2, Task 6)

Wave 3 (After Wave 2 — final integration):
└── Task 9: Context Manager Integration [unspecified-high] (depends: Task 1, Task 6)

Wave FINAL (After ALL tasks — verification):
├── Task F1: Integration Smoke Test [quick]
├── Task F2: Code Quality Scan [quick]
└── Task F3: Regression Test Suite [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | - | 6, 8, 9 |
| 2 | - | 8 |
| 3 | - | 7 |
| 4 | - | - |
| 5 | - | - |
| 6 | 1 | 8, 9 |
| 7 | 3 | - |
| 8 | 2, 6 | - |
| 9 | 1, 6 | - |

### Critical Path
Task 1 (Adapter) → Task 6 (Session) → Task 9 (Context)

---

## TODOs

---

- [ ] 1. Message Type Adapter

  **What to do**:
  - Create `src/adapters/message.ts` with two functions:
    - `loopMessageToMessage(msg: LoopMessage, sessionId: string): Message` — converts AgenticLoop's internal message to full Message type
    - `messageToLoopMessage(msg: Message): LoopMessage` — converts stored Message back to loop-compatible format
  - Handle edge cases: tool_calls in assistant messages, tool results, system messages
  - Create `src/adapters/message.test.ts` with round-trip tests
  - The `LoopMessage` type is `LLMCompletionOptions['messages'][number]` from `src/types/llm.ts`
  - The `Message` type is from `src/types/message.ts` — has `id`, `role`, `content`, `metadata` etc.

  **Must NOT do**:
  - Don't modify existing types — adapt between them
  - Don't add `as any` casts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 6, 9
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `src/adapters/message.ts` exists with both functions exported
  - [ ] `bun test src/adapters/message.test.ts` — all pass
  - [ ] `bun run typecheck` — 0 errors
  - [ ] Round-trip test: `messageToLoopMessage(loopMessageToMessage(msg))` preserves role+content

---

- [ ] 2. Security Integration

  **What to do**:
  - In `src/cli/index.ts` `runPlainCli()`:
    - Call `initializeSecurity()` BEFORE creating AgenticLoop
    - Create a CLI confirmation handler using readline (for plain CLI mode)
    - Call `setConfirmationHandler()` with the CLI handler
  - In `src/tui/index.ts` (or wherever TUI starts):
    - Create a TUI confirmation handler using blessed dialogs
    - Call `setConfirmationHandler()` with the TUI handler
  - Wire audit logging into tool execution:
    - In `ToolExecutor` or at loop level, log tool calls to audit
    - Use `getAuditLogger().log()` for each tool invocation
  - Guard with feature flag: skip if `config.enableSecurity === false`

  **Must NOT do**:
  - Don't auto-approve HIGH/CRITICAL without handler
  - Don't modify security module internals
  - Don't add blocking confirmation to non-dangerous operations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `src/security/index.ts` — `initializeSecurity()` entry point
  - `src/security/confirmation.ts` — `setConfirmationHandler()`, `requestConfirmation()`
  - `src/security/audit.ts` — `getAuditLogger()`, `initializeAuditLogger()`

  **Acceptance Criteria**:
  - [ ] `initializeSecurity()` called in both CLI and TUI startup paths
  - [ ] `bun test src/security/__tests__/integration.test.ts` — all pass
  - [ ] `bun run typecheck` — 0 errors
  - [ ] Tool execution generates audit events (verified via test)
  - [ ] HIGH risk operations NOT auto-approved without handler

---

- [ ] 3. Hooks Integration

  **What to do**:
  - Add `hooks?: HooksManager` optional parameter to `AgenticLoopConfig`
  - In `AgenticLoop.stream()`, emit events at lifecycle points:
    - `beforeLoop` — when stream starts (payload: `{input, history}`)
    - `afterLoop` — when stream ends (payload: `{result, iterations}`)
    - `beforeTool` — before tool execution (payload: `{toolName, args, iteration}`)
    - `afterTool` — after tool execution (payload: `{toolName, result, iteration}`)
    - `onError` — on error (payload: `{error, iteration}`)
  - In `src/cli/index.ts`, create `HooksManager` instance, pass to AgenticLoop
  - Add tests for hook emission in `src/loop/agentic.test.ts`

  **Must NOT do**:
  - Don't make hooks required (must be optional)
  - Don't block execution if hook handler throws (catch and log)
  - Don't break existing AgenticLoop tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src/hooks/manager.ts` — HooksManager class
  - `src/loop/agentic.ts` — AgenticLoop lifecycle points

  **Acceptance Criteria**:
  - [ ] `AgenticLoopConfig` accepts optional `hooks` parameter
  - [ ] All 5 hook events emitted at correct lifecycle points
  - [ ] `bun test src/loop/agentic.test.ts` — all pass (existing + new)
  - [ ] `bun run typecheck` — 0 errors
  - [ ] Hook handler errors caught, don't crash loop

---

- [ ] 4. LSP Tool Registration

  **What to do**:
  - In `src/cli/index.ts`, import `LSPTool` from `../tools/lsp`
  - Add `new LSPTool(cwd)` to the tools array alongside File, Shell, Search, Git, Web
  - Guard with feature flag: skip if `config.enableLsp === false`
  - Ensure LSP server processes are cleaned up on exit (add to cleanup handler in Task 8)

  **Must NOT do**:
  - Don't make LSP tool required (feature-flagged)
  - Don't start LSP servers eagerly (only on first use)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `LSPTool` imported and added to tools array
  - [ ] `bun run typecheck` — 0 errors
  - [ ] LSP tool appears in tool list when registered

---

- [ ] 5. Feature Flags in ConfigManager

  **What to do**:
  - Add boolean flags to `RuntimeConfig` in `src/config/manager.ts`:
    - `enableSecurity: boolean` (default: true)
    - `enableSessions: boolean` (default: true)
    - `enableLsp: boolean` (default: true)
    - `enableHooks: boolean` (default: true)
    - `enablePlugins: boolean` (default: true)
    - `enableSkills: boolean` (default: true)
  - Support environment variable overrides: `NANO_ENABLE_SECURITY=false` etc.
  - Extract hardcoded values from CLI to config defaults:
    - `maxIterations: 15` → configurable
    - `maxConsecutiveErrors: 3` → configurable
    - `toolTimeoutMs: 60000` → configurable
  - Update `ConfigManager.load()` to merge these fields
  - Add tests for flag parsing and env var override

  **Must NOT do**:
  - Don't rename existing fields
  - Don't break existing ConfigManager tests
  - Don't add dependencies (no dotenv — use process.env directly)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/config/manager.ts` — RuntimeConfig interface, ConfigManager class
  - `src/cli/index.ts:94,116-118` — hardcoded values to extract

  **Acceptance Criteria**:
  - [ ] All 6 feature flags in RuntimeConfig with defaults
  - [ ] Environment variable overrides work
  - [ ] Hardcoded values extracted to config defaults
  - [ ] `bun run typecheck` — 0 errors
  - [ ] `bun test` passes (existing + new config tests)

---

- [ ] 6. Session Integration

  **What to do**:
  - In `src/cli/index.ts` `runPlainCli()`:
    - Create `SessionManager` with SQLite database path (e.g., `.nano/sessions.db`)
    - Create a new session on startup (or resume if `--session <id>` flag provided)
    - After each AgenticLoop iteration, use message adapter (Task 1) to convert `LoopMessage` to `Message` and persist via `sessionManager.addMessage()`
    - On exit, save session state
  - Add `--session <id>` flag to CLI for resuming sessions
  - Add `/sessions` slash command to list recent sessions
  - Guard with feature flag: skip if `config.enableSessions === false`

  **Must NOT do**:
  - Don't store `LoopMessage[]` directly (use adapter from Task 1)
  - Don't block loop execution on session writes (async, fire-and-forget with error logging)
  - Don't break existing CLI tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 1 (Message Adapter)

  **References**:
  - `src/session/manager.ts` — SessionManager class
  - `src/session/database.ts` — SessionDatabase (SQLite)
  - `src/adapters/message.ts` — loopMessageToMessage() (from Task 1)
  - `src/cli/index.ts` — runPlainCli() integration point

  **Acceptance Criteria**:
  - [ ] SessionManager created and initialized in CLI startup
  - [ ] Messages persisted after loop iterations
  - [ ] `--session <id>` flag resumes existing session
  - [ ] `/sessions` slash command lists sessions
  - [ ] `bun run typecheck` — 0 errors
  - [ ] `bun test` — all pass

---

- [ ] 7. Plugins/Skills Integration

  **What to do**:
  - In `src/cli/index.ts` startup:
    - Create `PluginManager` instance
    - Create `SkillsManager` instance
    - Call `pluginManager.setupAll({cwd})` after config loaded
    - Load built-in skills via `skillsManager.registerMany()`
  - Wire `HooksManager` (from Task 3) to plugin lifecycle:
    - Plugins can register hooks via `hooks.on(name, handler)`
  - Guard with feature flags
  - Add cleanup via `pluginManager.disposeAll()` on exit

  **Must NOT do**:
  - Don't load external plugins from filesystem yet (just initialize framework)
  - Don't make plugins/skills required for CLI to function

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 3 (Hooks)

  **Acceptance Criteria**:
  - [ ] PluginManager and SkillsManager initialized in CLI
  - [ ] `pluginManager.setupAll()` called
  - [ ] Cleanup on exit via `pluginManager.disposeAll()`
  - [ ] `bun run typecheck` — 0 errors
  - [ ] `bun test` — all pass

---

- [ ] 8. CLI Cleanup Handler

  **What to do**:
  - Add `process.on('SIGINT', ...)` and `process.on('exit', ...)` handlers in CLI
  - Cleanup in order:
    1. `sessionManager.close()` — flush and close SQLite
    2. `auditLogger.close()` — flush audit events
    3. LSP tool servers shutdown (if running)
    4. `pluginManager.disposeAll()` — cleanup plugins
  - Handle cleanup errors gracefully (log, don't throw)
  - Ensure cleanup runs only once (guard flag)

  **Must NOT do**:
  - Don't call process.exit() inside cleanup (let process exit naturally)
  - Don't make cleanup synchronous blocking

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 2 (Security), Task 6 (Session)

  **Acceptance Criteria**:
  - [ ] SIGINT handler registered
  - [ ] All resources cleaned up in correct order
  - [ ] `bun run typecheck` — 0 errors
  - [ ] Cleanup guard prevents double-execution

---

- [ ] 9. Context Manager Integration

  **What to do**:
  - Modify `AgenticLoop` to use `InMemoryContextManager` from `src/context/manager.ts`
  - Add `contextManager?: ContextManager` optional parameter to `AgenticLoopConfig`
  - Before each LLM call in the loop:
    - Use context manager to check token count
    - If approaching limit, call `pruneContext()` to compress/remove old messages
  - Convert between `LoopMessage` and `ContextItem` using adapter from Task 1
  - In CLI, create `InMemoryContextManager` with appropriate token limits and pass to loop

  **Must NOT do**:
  - Don't make context manager required (optional, fallback to current behavior)
  - Don't break existing loop tests
  - Don't use real tiktoken (keep SimpleTokenCounter for now)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 1 (Adapter), Task 6 (Session)

  **References**:
  - `src/context/manager.ts` — InMemoryContextManager, SimpleTokenCounter
  - `src/loop/agentic.ts` — message management in stream()
  - `src/adapters/message.ts` — type conversion (from Task 1)

  **Acceptance Criteria**:
  - [ ] `AgenticLoopConfig` accepts optional `contextManager`
  - [ ] Token counting active when context manager provided
  - [ ] Pruning triggered when token limit approached
  - [ ] `bun test src/context/manager.test.ts` — all pass
  - [ ] `bun test src/loop/agentic.test.ts` — all pass
  - [ ] `bun run typecheck` — 0 errors

---

## Final Verification

---

- [ ] F1. Integration Smoke Test

  **What to do**:
  - Run full CLI one-shot with all modules active
  - Verify: audit events logged, session created, context managed, hooks emitted
  - Run TUI startup and verify all modules initialize
  
  **Acceptance Criteria**:
  - [ ] `bun test` — all pass (526+ tests, 0 fail)
  - [ ] `bun run typecheck` — 0 errors
  - [ ] One-shot prompt completes with security + session active

---

- [ ] F2. Code Quality Scan

  **What to do**:
  - Verify no new `as any` added
  - Verify no new `@ts-ignore` added  
  - Verify all new files have tests
  - Check for uncaught promise rejections in async cleanup

  **Acceptance Criteria**:
  - [ ] `as any` count same or lower than 36
  - [ ] All new files (.ts) have corresponding .test.ts
  - [ ] No `@ts-ignore` or `@ts-expect-error` added

---

- [ ] F3. Regression Test Suite

  **What to do**:
  - Run full test suite
  - Run integration tests
  - Run e2e tests
  - Verify no existing tests broken

  **Acceptance Criteria**:
  - [ ] `bun test` — 526+ pass, 0 fail
  - [ ] `bun run test:integration` — all pass
  - [ ] `bun run test:e2e` — all pass
