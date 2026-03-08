# Nano Claude Code - 企业级 AI 编程助手

## TL;DR

> **Quick Summary**: 构建一个企业级的 AI 编程助手 CLI 工具，支持多 LLM Provider、MCP 协议、多 Agent 协作、可编程 Skills 系统，以及完整的安全和持久化机制。
> 
> **Deliverables**:
> - 完整的 CLI + TUI 应用程序
> - 多 Provider LLM 集成 (Claude, OpenAI, 本地模型)
> - MCP 客户端实现
> - 5 种专业 Agent 及编排系统
> - 可编程 Skills 工作流系统
> - 完整的安全机制 (沙箱、确认、审计)
> - 本地会话持久化
> 
> **Estimated Effort**: XL (企业级项目)
> **Parallel Execution**: YES - 10 waves
> **Critical Path**: Setup → Types → Provider → Tools → Loop → Agents → TUI

---

## Context

### Original Request
用户希望构建一个 "Nano Claude Code" - 一个包含 Claude Code 核心功能的企业级 AI 编程助手，具有 Skills、MCP、Agents、Sessions 等高级功能。

### Interview Summary
**Key Discussions**:
- 技术栈: TypeScript + Bun + Blessed
- 产品形态: CLI + TUI
- AI Provider: 多 Provider (Claude, OpenAI, 本地模型)
- 功能范围: 企业级全功能版本
- 测试策略: TDD + 80%+ 覆盖率

**Research Findings**:
- MCP 使用 `@modelcontextprotocol/typescript-sdk` 官方 SDK
- Agentic Loop 参考 mastra-ai/AetherLink 模式
- Blessed 类型定义可能需要扩展
- 多 Provider 使用统一接口模式

### Metis Review
**Identified Gaps** (addressed with defaults):
- 上下文溢出策略: 智能压缩 + summarize older messages
- 工具确认列表: 文件写入/删除 + shell 执行 + git push
- 沙箱违规行为: 返回错误信息
- Agent 间通信: Message bus + Orchestrator routing
- Session 边界: 持久化跨天 (project-based)
- MCP 配置: 配置文件 + 项目级 `mcp.json`
- Git 实现: Shell commands
- LSP 实现: Spawn external server

---

## Work Objectives

### Core Objective
构建一个可生产使用的企业级 AI 编程助手，具有完整的 MCP 支持、多 Agent 协作和可编程工作流能力。

### Concrete Deliverables
- `nano-claude-code` CLI 可执行文件
- 6 个核心内置工具 (file, shell, search, git, web, lsp)
- MCP 客户端 (STDIO + HTTP 传输)
- 5 个专业 Agent (Coder, Reviewer, Researcher, Planner, Tester)
- 可编程 Skills 系统
- Blessed TUI 界面
- 本地 SQLite 会话存储

### Definition of Done
- [ ] `bun run typecheck` - 0 errors
- [ ] `bun test --coverage` - 80%+ 覆盖率
- [ ] `nano-claude-code --help` - 正确输出帮助信息
- [ ] 能够完成一个完整的 "读取文件 → 分析 → 建议修改" 循环

### Must Have
- Agentic Loop (ReAct 模式)
- 流式 LLM 响应
- MCP 客户端 (tools/resources/prompts)
- 5 种 Agent 类型及编排
- 操作确认和审计日志
- 本地会话持久化
- TUI 界面

### Must NOT Have (Guardrails)
- ❌ 云同步功能
- ❌ 多用户/认证系统
- ❌ GUI (Electron/Web)
- ❌ MCP 服务器托管 (只做客户端)
- ❌ 远程插件加载
- ❌ 动态 Agent 创建 (只用预定义的 5 种)
- ❌ 模型微调功能
- ❌ 语音输入
- ❌ 过度抽象 (保持实用)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (新项目)
- **Automated tests**: TDD
- **Framework**: bun test
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI**: Use Bash — Run command, validate output
- **TUI**: Use interactive_bash (tmux) — Launch TUI, send keystrokes, capture screenshot
- **API/Integration**: Use Bash (curl/bun) — Send requests, assert responses
- **Unit Tests**: Use `bun test` — Run specific test file

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Project scaffolding + Bun config [quick]
├── Task 2: Core types & interfaces definition [unspecified-high]
└── Task 3: Test infrastructure setup [quick]

Wave 2 (After Wave 1 — providers + tool foundation):
├── Task 4: LLM Provider interface + base class [unspecified-high]
├── Task 5: Claude provider implementation [unspecified-high]
├── Task 6: OpenAI provider implementation [unspecified-high]
└── Task 7: Tool system foundation [unspecified-high]

Wave 3 (After Wave 2 — built-in tools, MAX PARALLEL):
├── Task 8: File operations tool [unspecified-low]
├── Task 9: Shell execution tool [unspecified-low]
├── Task 10: Search tool (glob/grep) [unspecified-low]
├── Task 11: Git integration tool [unspecified-low]
├── Task 12: Web access tool [unspecified-low]
└── Task 13: Code intelligence tool (LSP) [unspecified-high]

Wave 4 (After Wave 2+3 — core loop):
├── Task 14: Agentic loop core [deep]
└── Task 15: Context management [unspecified-high]

Wave 5 (After Wave 4 — MCP + sessions):
├── Task 16: MCP client implementation [unspecified-high]
└── Task 17: Session persistence (SQLite) [unspecified-low]

Wave 6 (After Wave 5 — agent system):
├── Task 18: Agent system core + orchestrator [deep]
├── Task 19: Coder Agent [unspecified-high]
├── Task 20: Reviewer Agent [unspecified-high]
├── Task 21: Researcher Agent [unspecified-high]
├── Task 22: Planner Agent [unspecified-high]
└── Task 23: Tester Agent [unspecified-high]

Wave 7 (After Wave 4 — security):
├── Task 24: Security layer (confirmation, sandbox) [unspecified-high]
├── Task 25: Checkpoint system [unspecified-high]
└── Task 26: Audit logging [unspecified-low]

Wave 8 (After Wave 4 — CLI + TUI):
├── Task 27: CLI interface + slash commands [unspecified-low]
└── Task 28: TUI interface (Blessed) [visual-engineering]

Wave 9 (After Wave 7 — plugins + hooks + config):
├── Task 29: Configuration system [unspecified-low]
├── Task 30: Plugin system [unspecified-high]
└── Task 31: Hooks system [unspecified-low]

Wave 10 (After Wave 6+9 — skills + polish):
├── Task 32: Skills system [deep]
└── Task 33: Integration tests + documentation [writing]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: 1 → 2 → 4 → 7 → 14 → 18 → 32
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 3)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | - | 2-33 |
| 2 | 1 | 4-33 |
| 3 | 1 | 4-33 |
| 4 | 2 | 5,6,14 |
| 5 | 4 | 14 |
| 6 | 4 | 14 |
| 7 | 2 | 8-13,14 |
| 8-13 | 7 | 14 |
| 14 | 5/6, 7 | 15-33 |
| 15 | 14 | 16,18 |
| 16 | 7,14 | 32 |
| 17 | 14 | 27 |
| 18 | 14,15 | 19-23 |
| 19-23 | 18 | 32 |
| 24-26 | 7,14 | 30 |
| 27 | 14,17 | 28 |
| 28 | 27 | 33 |
| 29 | 1 | 30 |
| 30 | 7,24 | 31 |
| 31 | 30 | 32 |
| 32 | 18,31 | 33 |
| 33 | ALL | - |

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 3 | quick×2, unspecified-high×1 |
| 2 | 4 | unspecified-high×4 |
| 3 | 6 | unspecified-low×5, unspecified-high×1 |
| 4 | 2 | deep×1, unspecified-high×1 |
| 5 | 2 | unspecified-high×1, unspecified-low×1 |
| 6 | 6 | deep×1, unspecified-high×5 |
| 7 | 3 | unspecified-high×2, unspecified-low×1 |
| 8 | 2 | unspecified-low×1, visual-engineering×1 |
| 9 | 3 | unspecified-low×2, unspecified-high×1 |
| 10 | 2 | deep×1, writing×1 |
| FINAL | 4 | oracle×1, unspecified-high×2, deep×1 |

---

## TODOs

---

- [ ] 1. Project Scaffolding + Bun Configuration

  **What to do**:
  - Initialize Bun project with `bun init`
  - Configure `tsconfig.json` with strict mode
  - Setup `biome.json` for linting/formatting
  - Create directory structure:
    ```
    src/
    ├── providers/     # LLM providers
    ├── tools/         # Built-in tools
    ├── agents/        # Agent implementations
    ├── mcp/           # MCP client
    ├── skills/        # Skills system
    ├── loop/          # Agentic loop
    ├── context/       # Context management
    ├── session/       # Session persistence
    ├── security/      # Security layer
    ├── checkpoint/    # Checkpoint system
    ├── config/        # Configuration
    ├── plugins/       # Plugin system
    ├── hooks/         # Hooks system
    ├── cli/           # CLI interface
    ├── tui/           # TUI interface
    └── types/         # Shared types
    ```
  - Add essential dependencies: `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`, `blessed`, `better-sqlite3`
  - Configure `package.json` scripts

  **Must NOT do**:
  - 不要添加不必要的依赖
  - 不要创建复杂的构建配置

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2-33
  - **Blocked By**: None

  **References**:
  - Bun docs: https://bun.sh/docs
  - TypeScript strict config: https://www.typescriptlang.org/tsconfig

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` passes with 0 errors
  - [ ] Directory structure exists as specified
  - [ ] `package.json` contains all required dependencies

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Project structure validation
    Tool: Bash
    Preconditions: Project initialized
    Steps:
      1. Run `ls -la src/` and verify all directories exist
      2. Run `bun run typecheck` 
      3. Verify exit code is 0
    Expected Result: All 15 directories present, typecheck passes
    Failure Indicators: Missing directories, typecheck errors
    Evidence: .sisyphus/evidence/task-1-structure.txt

  Scenario: Dependencies installed correctly
    Tool: Bash
    Preconditions: `bun install` completed
    Steps:
      1. Run `bun pm ls` to list installed packages
      2. Verify @anthropic-ai/sdk, openai, @modelcontextprotocol/sdk present
    Expected Result: All required dependencies listed
    Evidence: .sisyphus/evidence/task-1-deps.txt
  ```

  **Commit**: YES
  - Message: `feat(init): scaffold project structure and configure Bun`
  - Files: `package.json`, `tsconfig.json`, `biome.json`, `src/**`

---

- [ ] 2. Core Types & Interfaces Definition

  **What to do**:
  - Define `LLMProvider` interface with streaming support
  - Define `Tool` interface with JSON Schema for parameters
  - Define `Agent` interface with role and capabilities
  - Define `Session` interface for persistence
  - Define `Config` types for layered configuration
  - Define `MCPClient` types matching official SDK
  - Define `Message` types for conversation history
  - Define `Context` types for context management
  - Export all types from `src/types/index.ts`

  **Must NOT do**:
  - 不要使用 `any` 类型
  - 不要过度泛化接口

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4-33
  - **Blocked By**: Task 1 (needs tsconfig)

  **References**:
  - Anthropic SDK types: https://github.com/anthropics/anthropic-sdk-typescript
  - MCP SDK types: https://github.com/modelcontextprotocol/typescript-sdk
  - OpenAI SDK types: https://github.com/openai/openai-node

  **Acceptance Criteria**:
  - [ ] All interfaces defined and exported
  - [ ] No `any` types in the codebase
  - [ ] `bun run typecheck` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Type completeness check
    Tool: Bash
    Preconditions: Types defined in src/types/
    Steps:
      1. Run `bun run typecheck`
      2. Run `grep -r "any" src/types/` to find any usage
      3. Verify grep returns empty or only valid uses
    Expected Result: Typecheck passes, no invalid `any` usage
    Failure Indicators: Typecheck errors, `any` types found
    Evidence: .sisyphus/evidence/task-2-types.txt

  Scenario: Interface export validation
    Tool: Bash
    Preconditions: src/types/index.ts exists
    Steps:
      1. Run `grep "export" src/types/index.ts`
      2. Verify LLMProvider, Tool, Agent, Session, Config exported
    Expected Result: All core interfaces exported
    Evidence: .sisyphus/evidence/task-2-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(types): define core interfaces for providers, tools, and agents`
  - Files: `src/types/**`

---

- [ ] 3. Test Infrastructure Setup

  **What to do**:
  - Configure `bun test` in `package.json`
  - Create test utilities in `src/__tests__/utils/`
  - Setup mock factories for LLM responses
  - Create test fixtures directory
  - Configure coverage reporting
  - Add `test:unit`, `test:integration`, `test:e2e` scripts

  **Must NOT do**:
  - 不要使用 Jest 或 Vitest (用 bun test)
  - 不要创建复杂的测试框架

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4-33
  - **Blocked By**: Task 1

  **References**:
  - Bun test docs: https://bun.sh/docs/cli/test

  **Acceptance Criteria**:
  - [ ] `bun test` command works
  - [ ] Coverage reporting configured
  - [ ] Mock utilities available

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Test runner works
    Tool: Bash
    Preconditions: Test infrastructure setup
    Steps:
      1. Create a simple test file `src/__tests__/example.test.ts`
      2. Run `bun test src/__tests__/example.test.ts`
      3. Verify test passes
    Expected Result: Test executes and passes
    Failure Indicators: Test runner errors
    Evidence: .sisyphus/evidence/task-3-test-runner.txt

  Scenario: Coverage reporting works
    Tool: Bash
    Preconditions: Test infrastructure setup
    Steps:
      1. Run `bun test --coverage`
      2. Verify coverage output is generated
    Expected Result: Coverage percentage displayed
    Evidence: .sisyphus/evidence/task-3-coverage.txt
  ```

  **Commit**: YES
  - Message: `feat(test): setup test infrastructure with bun test`
  - Files: `src/__tests__/**`, `package.json`

---

- [ ] 4. LLM Provider Interface + Base Class

  **What to do**:
  - Implement `BaseLLMProvider` abstract class
  - Add streaming support with AsyncIterable
  - Implement token counting interface
  - Add tool/function calling support
  - Implement retry logic with exponential backoff
  - Add provider factory for creating providers by name

  **Must NOT do**:
  - 不要实现具体的 provider (Claude/OpenAI 在其他任务)
  - 不要硬编码 API keys

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 5, 6, 14
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/types/provider.ts` - LLMProvider interface

  **Acceptance Criteria**:
  - [ ] BaseLLMProvider abstract class implemented
  - [ ] Streaming interface working
  - [ ] Unit tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Provider base class compiles
    Tool: Bash
    Preconditions: BaseLLMProvider implemented
    Steps:
      1. Run `bun run typecheck`
      2. Run `bun test src/providers/base.test.ts`
    Expected Result: Typecheck passes, tests pass
    Evidence: .sisyphus/evidence/task-4-provider-base.txt

  Scenario: Provider factory works
    Tool: Bash
    Preconditions: Provider factory implemented
    Steps:
      1. Run unit test for factory pattern
      2. Verify factory creates mock provider
    Expected Result: Factory correctly instantiates providers
    Evidence: .sisyphus/evidence/task-4-factory.txt
  ```

  **Commit**: YES
  - Message: `feat(providers): implement base provider class with streaming support`
  - Files: `src/providers/base.ts`, `src/providers/factory.ts`

---

- [ ] 5. Claude Provider Implementation

  **What to do**:
  - Implement `ClaudeProvider` extending `BaseLLMProvider`
  - Use `@anthropic-ai/sdk` for API calls
  - Implement streaming with `stream()` method
  - Support tool use (function calling)
  - Implement token counting using tiktoken or estimation
  - Handle rate limiting and errors gracefully

  **Must NOT do**:
  - 不要硬编码 API key
  - 不要忽略错误处理

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 14
  - **Blocked By**: Task 4

  **References**:
  - Anthropic SDK: https://github.com/anthropics/anthropic-sdk-typescript
  - `src/providers/base.ts` - BaseLLMProvider

  **Acceptance Criteria**:
  - [ ] Claude provider implemented
  - [ ] Streaming works
  - [ ] Tool use works
  - [ ] Tests pass with mocked API

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Claude provider generates response (mocked)
    Tool: Bash
    Preconditions: ClaudeProvider implemented
    Steps:
      1. Run `bun test src/providers/claude.test.ts`
      2. Verify mock responses are handled correctly
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-5-claude.txt

  Scenario: Streaming response works (mocked)
    Tool: Bash
    Preconditions: Streaming implemented
    Steps:
      1. Run streaming test with mock
      2. Verify chunks are received in order
    Expected Result: Streaming test passes
    Evidence: .sisyphus/evidence/task-5-streaming.txt
  ```

  **Commit**: YES
  - Message: `feat(providers): implement Claude provider with streaming and tool use`
  - Files: `src/providers/claude.ts`, `src/providers/claude.test.ts`

---

- [ ] 6. OpenAI Provider Implementation

  **What to do**:
  - Implement `OpenAIProvider` extending `BaseLLMProvider`
  - Use `openai` SDK for API calls
  - Implement streaming with `stream()` method
  - Support function calling
  - Implement token counting
  - Handle rate limiting and errors

  **Must NOT do**:
  - 不要硬编码 API key
  - 不要复制 Claude provider 代码 (使用继承)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Task 14
  - **Blocked By**: Task 4

  **References**:
  - OpenAI SDK: https://github.com/openai/openai-node
  - `src/providers/base.ts` - BaseLLMProvider

  **Acceptance Criteria**:
  - [ ] OpenAI provider implemented
  - [ ] Streaming works
  - [ ] Function calling works
  - [ ] Tests pass with mocked API

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: OpenAI provider generates response (mocked)
    Tool: Bash
    Preconditions: OpenAIProvider implemented
    Steps:
      1. Run `bun test src/providers/openai.test.ts`
      2. Verify mock responses handled correctly
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-6-openai.txt
  ```

  **Commit**: YES
  - Message: `feat(providers): implement OpenAI provider with streaming and function calling`
  - Files: `src/providers/openai.ts`, `src/providers/openai.test.ts`

---

- [ ] 7. Tool System Foundation

  **What to do**:
  - Implement `BaseTool` abstract class
  - Create `ToolRegistry` for tool management
  - Implement tool execution with timeout/cancellation
  - Add JSON Schema validation for tool parameters
  - Create tool result formatting
  - Implement tool discovery for LLM

  **Must NOT do**:
  - 不要实现具体工具 (在其他任务)
  - 不要跳过参数验证

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 8-13, 14
  - **Blocked By**: Tasks 1, 2

  **References**:
  - JSON Schema: https://json-schema.org/
  - `src/types/tool.ts` - Tool interface

  **Acceptance Criteria**:
  - [ ] BaseTool class implemented
  - [ ] ToolRegistry working
  - [ ] Timeout/cancellation working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tool registry works
    Tool: Bash
    Preconditions: ToolRegistry implemented
    Steps:
      1. Run `bun test src/tools/registry.test.ts`
      2. Verify tools can be registered and retrieved
    Expected Result: Registry tests pass
    Evidence: .sisyphus/evidence/task-7-registry.txt

  Scenario: Tool execution with timeout
    Tool: Bash
    Preconditions: Tool execution implemented
    Steps:
      1. Run timeout test with mock tool
      2. Verify timeout triggers after specified duration
    Expected Result: Timeout behavior correct
    Evidence: .sisyphus/evidence/task-7-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement tool system foundation with registry and execution`
  - Files: `src/tools/base.ts`, `src/tools/registry.ts`, `src/tools/executor.ts`

---

- [ ] 8. File Operations Tool

  **What to do**:
  - Implement `ReadFileTool` - read file contents
  - Implement `WriteFileTool` - write/create files (with confirmation hook)
  - Implement `EditFileTool` - modify file contents
  - Implement `DeleteFileTool` - delete files (with confirmation hook)
  - Add path validation and sandbox checking
  - Implement encoding detection

  **Must NOT do**:
  - 不要允许访问沙箱外的文件
  - 不要跳过确认钩子

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9-13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - `src/tools/base.ts` - BaseTool
  - Bun file APIs: https://bun.sh/docs/api/file-io

  **Acceptance Criteria**:
  - [ ] All file operations implemented
  - [ ] Sandbox checking working
  - [ ] Confirmation hooks called
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Read file works
    Tool: Bash
    Preconditions: ReadFileTool implemented
    Steps:
      1. Create test file `test-fixtures/sample.txt`
      2. Run `bun test src/tools/file.test.ts --grep "read"`
    Expected Result: File content returned correctly
    Evidence: .sisyphus/evidence/task-8-read.txt

  Scenario: Write file triggers confirmation
    Tool: Bash
    Preconditions: WriteFileTool with confirmation hook
    Steps:
      1. Run write test with mock confirmation
      2. Verify confirmation hook was called
    Expected Result: Confirmation hook invoked
    Evidence: .sisyphus/evidence/task-8-confirmation.txt

  Scenario: Sandbox violation rejected
    Tool: Bash
    Preconditions: Sandbox checking implemented
    Steps:
      1. Attempt to read `/etc/passwd` (outside sandbox)
      2. Verify error is returned
    Expected Result: Error with "outside sandbox" message
    Evidence: .sisyphus/evidence/task-8-sandbox.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement file operations with sandbox and confirmation`
  - Files: `src/tools/file.ts`, `src/tools/file.test.ts`

---

- [ ] 9. Shell Execution Tool

  **What to do**:
  - Implement `ShellTool` for command execution
  - Add timeout support with configurable duration
  - Implement streaming output capture
  - Add kill/cancel capability
  - Implement working directory support
  - Add environment variable handling
  - Require confirmation for all shell commands

  **Must NOT do**:
  - 不要跳过确认 (shell 命令总是需要确认)
  - 不要允许无限制执行时间

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10-13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - `src/tools/base.ts` - BaseTool
  - Bun shell: https://bun.sh/docs/runtime/shell

  **Acceptance Criteria**:
  - [ ] Shell execution working
  - [ ] Timeout working
  - [ ] Streaming output working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Shell command executes
    Tool: Bash
    Preconditions: ShellTool implemented
    Steps:
      1. Run `bun test src/tools/shell.test.ts --grep "execute"`
      2. Verify simple command (echo "test") works
    Expected Result: Command output captured
    Evidence: .sisyphus/evidence/task-9-execute.txt

  Scenario: Command timeout works
    Tool: Bash
    Preconditions: Timeout implemented
    Steps:
      1. Run test with `sleep 10` command and 1s timeout
      2. Verify timeout error returned after ~1s
    Expected Result: Timeout triggers, process killed
    Evidence: .sisyphus/evidence/task-9-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement shell execution with timeout and streaming`
  - Files: `src/tools/shell.ts`, `src/tools/shell.test.ts`

---

- [ ] 10. Search Tool (Glob/Grep)

  **What to do**:
  - Implement `GlobTool` for file pattern matching
  - Implement `GrepTool` for content search with regex
  - Add result limiting for large searches
  - Support ignore patterns (.gitignore)
  - Implement context lines for grep results

  **Must NOT do**:
  - 不要返回无限制的结果
  - 不要搜索沙箱外的文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11-13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - `src/tools/base.ts` - BaseTool
  - Bun Glob: https://bun.sh/docs/api/glob

  **Acceptance Criteria**:
  - [ ] Glob search working
  - [ ] Grep search working
  - [ ] Result limiting working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Glob pattern matching
    Tool: Bash
    Preconditions: GlobTool implemented
    Steps:
      1. Create test files `test-fixtures/*.ts`
      2. Run glob test with pattern `**/*.ts`
      3. Verify all .ts files found
    Expected Result: All matching files returned
    Evidence: .sisyphus/evidence/task-10-glob.txt

  Scenario: Grep content search
    Tool: Bash
    Preconditions: GrepTool implemented
    Steps:
      1. Run grep test with pattern "function"
      2. Verify matches with context lines returned
    Expected Result: Matches with line numbers returned
    Evidence: .sisyphus/evidence/task-10-grep.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement search tools with glob and grep`
  - Files: `src/tools/search.ts`, `src/tools/search.test.ts`

---

- [ ] 11. Git Integration Tool

  **What to do**:
  - Implement `GitStatusTool` - show working tree status
  - Implement `GitDiffTool` - show changes
  - Implement `GitAddTool` - stage files
  - Implement `GitCommitTool` - create commits (with confirmation)
  - Implement `GitPushTool` - push to remote (with confirmation)
  - Implement `GitLogTool` - show commit history
  - Use shell commands for git operations

  **Must NOT do**:
  - 不要使用 isomorphic-git (使用 shell git)
  - 不要允许 push 不经确认

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8-10, 12-13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - `src/tools/base.ts` - BaseTool
  - `src/tools/shell.ts` - ShellTool (for executing git)

  **Acceptance Criteria**:
  - [ ] All git operations implemented
  - [ ] Push/commit require confirmation
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Git status works
    Tool: Bash
    Preconditions: GitStatusTool implemented
    Steps:
      1. Initialize test git repo
      2. Run git status tool
      3. Verify output matches `git status`
    Expected Result: Status output correct
    Evidence: .sisyphus/evidence/task-11-status.txt

  Scenario: Git push requires confirmation
    Tool: Bash
    Preconditions: GitPushTool with confirmation
    Steps:
      1. Run push tool with mock confirmation
      2. Verify confirmation hook called before push
    Expected Result: Confirmation required
    Evidence: .sisyphus/evidence/task-11-push-confirm.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement git integration tools`
  - Files: `src/tools/git.ts`, `src/tools/git.test.ts`

---

- [ ] 12. Web Access Tool

  **What to do**:
  - Implement `FetchTool` - fetch URL content
  - Implement `WebSearchTool` - search interface (stub for external service)
  - Add timeout support
  - Handle redirects and errors
  - Implement content type detection
  - Add response size limiting

  **Must NOT do**:
  - 不要实现完整的搜索引擎集成 (只提供接口)
  - 不要允许无限制下载

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8-11, 13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - `src/tools/base.ts` - BaseTool
  - Bun fetch: https://bun.sh/docs/api/fetch

  **Acceptance Criteria**:
  - [ ] URL fetch working
  - [ ] Timeout working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: URL fetch works
    Tool: Bash
    Preconditions: FetchTool implemented
    Steps:
      1. Run fetch test with mock server
      2. Verify content returned correctly
    Expected Result: Content fetched
    Evidence: .sisyphus/evidence/task-12-fetch.txt

  Scenario: Fetch timeout works
    Tool: Bash
    Preconditions: Timeout implemented
    Steps:
      1. Run fetch with slow mock server and 1s timeout
      2. Verify timeout error returned
    Expected Result: Timeout error
    Evidence: .sisyphus/evidence/task-12-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement web access tools`
  - Files: `src/tools/web.ts`, `src/tools/web.test.ts`

---

- [ ] 13. Code Intelligence Tool (LSP)

  **What to do**:
  - Implement `LSPClient` for language server communication
  - Implement `GotoDefinitionTool` - jump to definition
  - Implement `FindReferencesTool` - find all references
  - Implement `DiagnosticsTool` - get errors/warnings
  - Support spawning external language servers
  - Handle server lifecycle (start, stop, restart)

  **Must NOT do**:
  - 不要嵌入语言服务器 (使用外部服务器)
  - 不要支持所有语言 (从 TypeScript 开始)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8-12)
  - **Blocks**: Task 14
  - **Blocked By**: Task 7

  **References**:
  - LSP Specification: https://microsoft.github.io/language-server-protocol/
  - `src/tools/base.ts` - BaseTool

  **Acceptance Criteria**:
  - [ ] LSP client working
  - [ ] Goto definition working
  - [ ] Find references working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: LSP client connects
    Tool: Bash
    Preconditions: LSPClient implemented
    Steps:
      1. Start typescript-language-server
      2. Run connection test
      3. Verify initialized response
    Expected Result: Server connected
    Evidence: .sisyphus/evidence/task-13-connect.txt

  Scenario: Goto definition works
    Tool: Bash
    Preconditions: GotoDefinitionTool implemented
    Steps:
      1. Create test TypeScript file with function definition
      2. Run goto definition on function call
      3. Verify definition location returned
    Expected Result: Correct file:line:column returned
    Evidence: .sisyphus/evidence/task-13-definition.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): implement LSP-based code intelligence`
  - Files: `src/tools/lsp.ts`, `src/tools/lsp.test.ts`

---

- [ ] 14. Agentic Loop Core

  **What to do**:
  - Implement main agentic loop following ReAct pattern
  - Build context from system prompt + history + tool results
  - Call LLM with tool definitions
  - Parse and execute tool calls
  - Add iteration to context and repeat
  - Implement iteration limits (max 25)
  - Implement consecutive error limits (max 3)
  - Implement completion detection
  - Add state tracking for debugging

  **Must NOT do**:
  - 不要无限循环 (强制迭代限制)
  - 不要忽略错误计数

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Wave 2+3)
  - **Blocks**: Tasks 15-33
  - **Blocked By**: Tasks 5/6, 7

  **References**:
  - ReAct pattern: https://arxiv.org/abs/2210.03629
  - `src/providers/base.ts` - LLM provider
  - `src/tools/registry.ts` - Tool registry

  **Acceptance Criteria**:
  - [ ] Loop executes correctly
  - [ ] Tool calls handled
  - [ ] Iteration limits enforced
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Simple loop completes
    Tool: Bash
    Preconditions: Agentic loop implemented
    Steps:
      1. Run loop with mock provider returning text
      2. Verify loop completes after 1 iteration
    Expected Result: Loop returns text response
    Evidence: .sisyphus/evidence/task-14-simple.txt

  Scenario: Tool call loop works
    Tool: Bash
    Preconditions: Tool execution integrated
    Steps:
      1. Run loop with mock provider returning tool call
      2. Verify tool executed
      3. Verify tool result sent back to LLM
    Expected Result: Tool executed, result in context
    Evidence: .sisyphus/evidence/task-14-tool.txt

  Scenario: Iteration limit enforced
    Tool: Bash
    Preconditions: Iteration limit implemented
    Steps:
      1. Run loop with mock provider always returning tool calls
      2. Verify loop stops at 25 iterations
    Expected Result: Error after 25 iterations
    Evidence: .sisyphus/evidence/task-14-limit.txt
  ```

  **Commit**: YES
  - Message: `feat(loop): implement agentic loop with ReAct pattern`
  - Files: `src/loop/agentic.ts`, `src/loop/agentic.test.ts`

---

- [ ] 15. Context Management

  **What to do**:
  - Implement token counting for messages
  - Implement context window tracking
  - Implement message compression/summarization when overflow
  - Implement intelligent truncation (keep recent, summarize old)
  - Add priority system (system > tool results > history)
  - Implement context serialization for sessions

  **Must NOT do**:
  - 不要简单截断 (使用智能压缩)
  - 不要丢失关键信息

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Task 14)
  - **Blocks**: Tasks 16, 18
  - **Blocked By**: Task 14

  **References**:
  - `src/types/context.ts` - Context types
  - tiktoken for token counting

  **Acceptance Criteria**:
  - [ ] Token counting accurate
  - [ ] Overflow handling working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Token counting works
    Tool: Bash
    Preconditions: Token counter implemented
    Steps:
      1. Count tokens for known string
      2. Verify count matches expected
    Expected Result: Token count accurate (±5%)
    Evidence: .sisyphus/evidence/task-15-tokens.txt

  Scenario: Overflow compression works
    Tool: Bash
    Preconditions: Compression implemented
    Steps:
      1. Create context exceeding limit
      2. Run compression
      3. Verify result fits in limit
    Expected Result: Context compressed, key info retained
    Evidence: .sisyphus/evidence/task-15-compress.txt
  ```

  **Commit**: YES
  - Message: `feat(context): implement context management with smart compression`
  - Files: `src/context/manager.ts`, `src/context/manager.test.ts`

---

- [ ] 16. MCP Client Implementation

  **What to do**:
  - Implement MCP client using `@modelcontextprotocol/sdk`
  - Support STDIO transport for local servers
  - Support HTTP transport for remote servers
  - Implement tool discovery (`tools/list`)
  - Implement tool invocation (`tools/call`)
  - Implement resource discovery and reading
  - Implement prompt discovery and retrieval
  - Handle server lifecycle (connect, disconnect, reconnect)

  **Must NOT do**:
  - 不要实现自定义传输 (使用 SDK 传输)
  - 不要实现 MCP 服务器 (只做客户端)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 17)
  - **Blocks**: Task 32
  - **Blocked By**: Tasks 7, 14

  **References**:
  - MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
  - MCP Spec: https://modelcontextprotocol.io/specification/2025-03-26
  - `src/types/mcp.ts` - MCP types

  **Acceptance Criteria**:
  - [ ] Client connects to MCP server
  - [ ] Tool discovery works
  - [ ] Tool invocation works
  - [ ] Tests pass with mock server

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: MCP client connects (STDIO)
    Tool: Bash
    Preconditions: MCPClient implemented
    Steps:
      1. Create mock MCP server script
      2. Run connection test
      3. Verify initialization handshake
    Expected Result: Client connected, capabilities exchanged
    Evidence: .sisyphus/evidence/task-16-connect.txt

  Scenario: Tool discovery works
    Tool: Bash
    Preconditions: Tool discovery implemented
    Steps:
      1. Connect to mock server with tools
      2. Run `tools/list`
      3. Verify tools returned
    Expected Result: Tool list with schemas returned
    Evidence: .sisyphus/evidence/task-16-tools.txt
  ```

  **Commit**: YES
  - Message: `feat(mcp): implement MCP client with STDIO and HTTP transports`
  - Files: `src/mcp/client.ts`, `src/mcp/client.test.ts`

---

- [ ] 17. Session Persistence (SQLite)

  **What to do**:
  - Implement session storage using better-sqlite3
  - Store conversation history with messages
  - Store session metadata (created, updated, project)
  - Implement session listing
  - Implement session resumption
  - Implement session deletion
  - Handle concurrent access safely

  **Must NOT do**:
  - 不要使用云存储
  - 不要存储敏感信息明文

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 16)
  - **Blocks**: Task 27
  - **Blocked By**: Task 14

  **References**:
  - better-sqlite3: https://github.com/WiseLibs/better-sqlite3
  - `src/types/session.ts` - Session types

  **Acceptance Criteria**:
  - [ ] Session save/load working
  - [ ] Listing working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Session save and load
    Tool: Bash
    Preconditions: Session persistence implemented
    Steps:
      1. Create session with messages
      2. Save session
      3. Load session by ID
      4. Verify messages match
    Expected Result: Session restored correctly
    Evidence: .sisyphus/evidence/task-17-save-load.txt

  Scenario: Session listing works
    Tool: Bash
    Preconditions: Session listing implemented
    Steps:
      1. Create multiple sessions
      2. List all sessions
      3. Verify all sessions returned with metadata
    Expected Result: All sessions listed
    Evidence: .sisyphus/evidence/task-17-list.txt
  ```

  **Commit**: YES
  - Message: `feat(session): implement session persistence with SQLite`
  - Files: `src/session/persistence.ts`, `src/session/persistence.test.ts`

---

- [ ] 18. Agent System Core + Orchestrator

  **What to do**:
  - Implement `BaseAgent` abstract class
  - Implement `AgentRegistry` for agent management
  - Implement `AgentOrchestrator` for coordinating agents
  - Implement message bus for inter-agent communication
  - Implement task assignment and routing
  - Add agent lifecycle management

  **Must NOT do**:
  - 不要实现具体 Agent (在其他任务)
  - 不要允许动态创建 Agent 类型

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (sequential)
  - **Blocks**: Tasks 19-23
  - **Blocked By**: Tasks 14, 15

  **References**:
  - `src/types/agent.ts` - Agent types
  - `src/loop/agentic.ts` - Agentic loop (agents use this)

  **Acceptance Criteria**:
  - [ ] BaseAgent class working
  - [ ] Orchestrator routing messages
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Agent registration works
    Tool: Bash
    Preconditions: AgentRegistry implemented
    Steps:
      1. Create mock agent
      2. Register with registry
      3. Retrieve agent by type
    Expected Result: Agent retrieved correctly
    Evidence: .sisyphus/evidence/task-18-registry.txt

  Scenario: Orchestrator routes messages
    Tool: Bash
    Preconditions: Orchestrator implemented
    Steps:
      1. Register multiple agents
      2. Send message to orchestrator
      3. Verify correct agent receives message
    Expected Result: Message routed to correct agent
    Evidence: .sisyphus/evidence/task-18-routing.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement agent system core and orchestrator`
  - Files: `src/agents/base.ts`, `src/agents/orchestrator.ts`, `src/agents/registry.ts`

---

- [ ] 19. Coder Agent

  **What to do**:
  - Implement `CoderAgent` extending `BaseAgent`
  - Define coder-specific system prompt
  - Configure available tools (file ops, search, shell)
  - Implement code generation workflow
  - Implement code modification workflow
  - Add code quality checks

  **Must NOT do**:
  - 不要让 Coder Agent 做 review (那是 Reviewer 的工作)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 20-23)
  - **Blocks**: Task 32
  - **Blocked By**: Task 18

  **References**:
  - `src/agents/base.ts` - BaseAgent
  - `src/tools/` - Available tools

  **Acceptance Criteria**:
  - [ ] CoderAgent implemented
  - [ ] Can generate code
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Coder generates code
    Tool: Bash
    Preconditions: CoderAgent implemented
    Steps:
      1. Create coder agent with mock provider
      2. Request code generation
      3. Verify code output
    Expected Result: Code generated
    Evidence: .sisyphus/evidence/task-19-generate.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement Coder agent`
  - Files: `src/agents/coder.ts`, `src/agents/coder.test.ts`

---

- [ ] 20. Reviewer Agent

  **What to do**:
  - Implement `ReviewerAgent` extending `BaseAgent`
  - Define reviewer-specific system prompt
  - Configure available tools (file read, search, git diff)
  - Implement code review workflow
  - Implement quality scoring
  - Generate structured feedback

  **Must NOT do**:
  - 不要让 Reviewer 修改代码 (只提建议)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 19, 21-23)
  - **Blocks**: Task 32
  - **Blocked By**: Task 18

  **References**:
  - `src/agents/base.ts` - BaseAgent

  **Acceptance Criteria**:
  - [ ] ReviewerAgent implemented
  - [ ] Can review code
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Reviewer analyzes code
    Tool: Bash
    Preconditions: ReviewerAgent implemented
    Steps:
      1. Create reviewer agent with mock provider
      2. Submit code for review
      3. Verify feedback returned
    Expected Result: Structured feedback with suggestions
    Evidence: .sisyphus/evidence/task-20-review.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement Reviewer agent`
  - Files: `src/agents/reviewer.ts`, `src/agents/reviewer.test.ts`

---

- [ ] 21. Researcher Agent

  **What to do**:
  - Implement `ResearcherAgent` extending `BaseAgent`
  - Define researcher-specific system prompt
  - Configure available tools (web, search, file read)
  - Implement research workflow
  - Implement source aggregation
  - Generate research summaries

  **Must NOT do**:
  - 不要让 Researcher 写代码

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 19-20, 22-23)
  - **Blocks**: Task 32
  - **Blocked By**: Task 18

  **References**:
  - `src/agents/base.ts` - BaseAgent

  **Acceptance Criteria**:
  - [ ] ResearcherAgent implemented
  - [ ] Can search and summarize
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Researcher gathers information
    Tool: Bash
    Preconditions: ResearcherAgent implemented
    Steps:
      1. Create researcher agent with mock provider
      2. Request research on topic
      3. Verify summary returned
    Expected Result: Research summary with sources
    Evidence: .sisyphus/evidence/task-21-research.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement Researcher agent`
  - Files: `src/agents/researcher.ts`, `src/agents/researcher.test.ts`

---

- [ ] 22. Planner Agent

  **What to do**:
  - Implement `PlannerAgent` extending `BaseAgent`
  - Define planner-specific system prompt
  - Configure available tools (file read, search)
  - Implement task decomposition workflow
  - Implement plan generation
  - Implement dependency analysis

  **Must NOT do**:
  - 不要让 Planner 执行任务 (只做规划)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 19-21, 23)
  - **Blocks**: Task 32
  - **Blocked By**: Task 18

  **References**:
  - `src/agents/base.ts` - BaseAgent

  **Acceptance Criteria**:
  - [ ] PlannerAgent implemented
  - [ ] Can generate plans
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Planner generates task plan
    Tool: Bash
    Preconditions: PlannerAgent implemented
    Steps:
      1. Create planner agent with mock provider
      2. Request plan for complex task
      3. Verify structured plan returned
    Expected Result: Plan with tasks and dependencies
    Evidence: .sisyphus/evidence/task-22-plan.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement Planner agent`
  - Files: `src/agents/planner.ts`, `src/agents/planner.test.ts`

---

- [ ] 23. Tester Agent

  **What to do**:
  - Implement `TesterAgent` extending `BaseAgent`
  - Define tester-specific system prompt
  - Configure available tools (shell, file read/write, search)
  - Implement test generation workflow
  - Implement test execution workflow
  - Generate test reports

  **Must NOT do**:
  - 不要让 Tester 修改非测试代码

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 19-22)
  - **Blocks**: Task 32
  - **Blocked By**: Task 18

  **References**:
  - `src/agents/base.ts` - BaseAgent

  **Acceptance Criteria**:
  - [ ] TesterAgent implemented
  - [ ] Can generate and run tests
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tester generates tests
    Tool: Bash
    Preconditions: TesterAgent implemented
    Steps:
      1. Create tester agent with mock provider
      2. Request tests for function
      3. Verify test code generated
    Expected Result: Test code with assertions
    Evidence: .sisyphus/evidence/task-23-generate.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): implement Tester agent`
  - Files: `src/agents/tester.ts`, `src/agents/tester.test.ts`

---

- [ ] 24. Security Layer (Confirmation, Sandbox)

  **What to do**:
  - Implement operation confirmation system
  - Define dangerous operations list (file write, shell, git push)
  - Implement filesystem sandbox with allowed paths
  - Implement path validation and traversal protection
  - Add symlink handling
  - Implement rate limiting for tool calls

  **Must NOT do**:
  - 不要绕过确认
  - 不要允许沙箱逃逸

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 25, 26)
  - **Blocks**: Task 30
  - **Blocked By**: Tasks 7, 14

  **References**:
  - `src/tools/` - Tools to secure

  **Acceptance Criteria**:
  - [ ] Confirmation working
  - [ ] Sandbox enforced
  - [ ] Rate limiting working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dangerous operation requires confirmation
    Tool: Bash
    Preconditions: Confirmation system implemented
    Steps:
      1. Attempt file write operation
      2. Verify confirmation prompt shown
      3. Verify operation blocked without confirmation
    Expected Result: Operation blocked until confirmed
    Evidence: .sisyphus/evidence/task-24-confirm.txt

  Scenario: Sandbox violation blocked
    Tool: Bash
    Preconditions: Sandbox implemented
    Steps:
      1. Attempt to access file outside sandbox
      2. Verify access denied
    Expected Result: Error returned, access blocked
    Evidence: .sisyphus/evidence/task-24-sandbox.txt
  ```

  **Commit**: YES
  - Message: `feat(security): implement confirmation, sandbox, and rate limiting`
  - Files: `src/security/confirmation.ts`, `src/security/sandbox.ts`, `src/security/ratelimit.ts`

---

- [ ] 25. Checkpoint System

  **What to do**:
  - Implement checkpoint creation before dangerous operations
  - Store checkpoint data (file states, command history)
  - Implement rollback functionality
  - Implement checkpoint listing
  - Add checkpoint expiration
  - Implement storage management

  **Must NOT do**:
  - 不要存储无限检查点 (需要过期机制)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 24, 26)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 24

  **References**:
  - `src/security/` - Security layer

  **Acceptance Criteria**:
  - [ ] Checkpoint creation working
  - [ ] Rollback working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Checkpoint created and restored
    Tool: Bash
    Preconditions: Checkpoint system implemented
    Steps:
      1. Create file
      2. Create checkpoint
      3. Modify file
      4. Rollback to checkpoint
      5. Verify file restored
    Expected Result: File restored to checkpoint state
    Evidence: .sisyphus/evidence/task-25-rollback.txt
  ```

  **Commit**: YES
  - Message: `feat(checkpoint): implement checkpoint and rollback system`
  - Files: `src/checkpoint/manager.ts`, `src/checkpoint/manager.test.ts`

---

- [ ] 26. Audit Logging

  **What to do**:
  - Implement audit logger
  - Log all tool invocations
  - Log all LLM calls
  - Log security events (confirmations, blocks)
  - Implement structured logging format
  - Add log rotation

  **Must NOT do**:
  - 不要记录敏感信息 (API keys)
  - 不要无限制增长日志

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 24, 25)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 14

  **References**:
  - `src/types/audit.ts` - Audit types

  **Acceptance Criteria**:
  - [ ] Logging working
  - [ ] Rotation working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tool invocation logged
    Tool: Bash
    Preconditions: Audit logger implemented
    Steps:
      1. Execute tool
      2. Check audit log
      3. Verify entry exists with timestamp, tool name, params
    Expected Result: Log entry with complete information
    Evidence: .sisyphus/evidence/task-26-log.txt
  ```

  **Commit**: YES
  - Message: `feat(audit): implement audit logging with rotation`
  - Files: `src/audit/logger.ts`, `src/audit/logger.test.ts`

---

- [ ] 27. CLI Interface + Slash Commands

  **What to do**:
  - Implement CLI entry point
  - Parse command line arguments
  - Implement REPL mode
  - Implement slash commands:
    - `/help` - show help
    - `/exit` - exit
    - `/session list` - list sessions
    - `/session load <id>` - load session
    - `/session new` - new session
    - `/agent <type>` - switch agent
    - `/clear` - clear context
  - Add command history
  - Implement tab completion

  **Must NOT do**:
  - 不要添加 GUI
  - 不要添加不必要的命令

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Task 28)
  - **Blocks**: Task 28
  - **Blocked By**: Tasks 14, 17

  **References**:
  - `src/loop/agentic.ts` - Agentic loop
  - `src/session/` - Session management

  **Acceptance Criteria**:
  - [ ] CLI starts correctly
  - [ ] Slash commands work
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: CLI help command
    Tool: Bash
    Preconditions: CLI implemented
    Steps:
      1. Run `nano-claude-code --help`
      2. Verify help output shown
    Expected Result: Help with usage and commands
    Evidence: .sisyphus/evidence/task-27-help.txt

  Scenario: Slash command /session list
    Tool: interactive_bash (tmux)
    Preconditions: CLI with slash commands
    Steps:
      1. Start CLI in tmux
      2. Send `/session list` command
      3. Capture output
    Expected Result: Session list displayed
    Evidence: .sisyphus/evidence/task-27-session-list.png
  ```

  **Commit**: YES
  - Message: `feat(cli): implement CLI interface with slash commands`
  - Files: `src/cli/index.ts`, `src/cli/commands.ts`, `src/cli/repl.ts`

---

- [ ] 28. TUI Interface (Blessed)

  **What to do**:
  - Implement Blessed-based TUI
  - Create main layout with panels:
    - Chat panel (streaming output)
    - Input panel
    - Status bar (model, tokens, session)
    - Optional: File tree panel
  - Implement keyboard shortcuts
  - Handle terminal resize
  - Implement scrolling and navigation
  - Add syntax highlighting for code

  **Must NOT do**:
  - 不要使用其他 TUI 框架 (只用 Blessed)
  - 不要过度复杂化界面

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (after Task 27)
  - **Blocks**: Task 33
  - **Blocked By**: Task 27

  **References**:
  - Blessed: https://github.com/chjj/blessed
  - blessed-contrib: https://github.com/yaronn/blessed-contrib
  - `src/cli/` - CLI interface

  **Acceptance Criteria**:
  - [ ] TUI renders correctly
  - [ ] Streaming output works
  - [ ] Keyboard shortcuts work
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: TUI renders correctly
    Tool: interactive_bash (tmux)
    Preconditions: TUI implemented
    Steps:
      1. Start TUI in tmux: `nano-claude-code --tui`
      2. Wait for render
      3. Capture screenshot
      4. Verify all panels visible
    Expected Result: Chat, input, status panels visible
    Evidence: .sisyphus/evidence/task-28-render.png

  Scenario: Streaming output displays
    Tool: interactive_bash (tmux)
    Preconditions: TUI with streaming
    Steps:
      1. Start TUI
      2. Send message
      3. Observe streaming response
      4. Capture screenshot mid-stream
    Expected Result: Text appearing progressively
    Evidence: .sisyphus/evidence/task-28-stream.png

  Scenario: Terminal resize handled
    Tool: interactive_bash (tmux)
    Preconditions: Resize handling implemented
    Steps:
      1. Start TUI
      2. Resize terminal
      3. Verify layout adjusts
    Expected Result: Layout reflows correctly
    Evidence: .sisyphus/evidence/task-28-resize.png
  ```

  **Commit**: YES
  - Message: `feat(tui): implement Blessed-based TUI interface`
  - Files: `src/tui/index.ts`, `src/tui/panels/*.ts`, `src/tui/layout.ts`

---

- [ ] 29. Configuration System

  **What to do**:
  - Implement layered configuration (global + project)
  - Support YAML and JSON formats
  - Global config: `~/.nano-claude-code/config.yaml`
  - Project config: `.nano-claude-code/config.yaml`
  - MCP server config: `.nano-claude-code/mcp.json`
  - Implement config validation with Zod
  - Implement config merging (project overrides global)
  - Add default values

  **Must NOT do**:
  - 不要添加环境变量覆盖 (保持简单)
  - 不要支持远程配置

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 9 (with Tasks 30, 31)
  - **Blocks**: Task 30
  - **Blocked By**: Task 1

  **References**:
  - `src/types/config.ts` - Config types
  - Zod: https://zod.dev/

  **Acceptance Criteria**:
  - [ ] Config loading working
  - [ ] Merging working
  - [ ] Validation working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Config loads and merges
    Tool: Bash
    Preconditions: Config system implemented
    Steps:
      1. Create global config with setting A=1
      2. Create project config with setting A=2
      3. Load config
      4. Verify A=2 (project overrides)
    Expected Result: Project config overrides global
    Evidence: .sisyphus/evidence/task-29-merge.txt

  Scenario: Invalid config rejected
    Tool: Bash
    Preconditions: Validation implemented
    Steps:
      1. Create config with invalid field
      2. Attempt to load
      3. Verify validation error
    Expected Result: Clear validation error message
    Evidence: .sisyphus/evidence/task-29-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(config): implement layered configuration system`
  - Files: `src/config/loader.ts`, `src/config/schema.ts`, `src/config/loader.test.ts`

---

- [ ] 30. Plugin System

  **What to do**:
  - Implement local plugin loading from `~/.nano-claude-code/plugins/`
  - Define plugin API (tools, hooks, commands)
  - Implement plugin lifecycle (load, unload, reload)
  - Add plugin validation
  - Support TypeScript and JavaScript plugins
  - Implement plugin isolation

  **Must NOT do**:
  - 不要从网络加载插件
  - 不要允许插件绕过安全层

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 9 (with Tasks 29, 31)
  - **Blocks**: Task 31
  - **Blocked By**: Tasks 7, 24

  **References**:
  - `src/tools/` - Tool system (plugins can add tools)
  - `src/security/` - Security layer

  **Acceptance Criteria**:
  - [ ] Plugin loading working
  - [ ] Plugin API working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Plugin loads and registers tool
    Tool: Bash
    Preconditions: Plugin system implemented
    Steps:
      1. Create test plugin with custom tool
      2. Place in plugins directory
      3. Start application
      4. Verify tool registered
    Expected Result: Plugin tool available
    Evidence: .sisyphus/evidence/task-30-load.txt
  ```

  **Commit**: YES
  - Message: `feat(plugins): implement local plugin system`
  - Files: `src/plugins/loader.ts`, `src/plugins/api.ts`, `src/plugins/loader.test.ts`

---

- [ ] 31. Hooks System

  **What to do**:
  - Implement event emitter for hooks
  - Define hook points:
    - `beforeToolCall` - before tool execution
    - `afterToolCall` - after tool execution
    - `beforeLLMCall` - before LLM request
    - `afterLLMCall` - after LLM response
    - `onError` - on any error
  - Allow plugins to register hooks
  - Implement hook execution order

  **Must NOT do**:
  - 不要添加过多 hook 点 (保持简单)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 9 (with Tasks 29, 30)
  - **Blocks**: Task 32
  - **Blocked By**: Task 30

  **References**:
  - `src/plugins/` - Plugin system
  - EventEmitter pattern

  **Acceptance Criteria**:
  - [ ] Hooks firing correctly
  - [ ] Registration working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Hook fires on tool call
    Tool: Bash
    Preconditions: Hooks system implemented
    Steps:
      1. Register beforeToolCall hook
      2. Execute tool
      3. Verify hook was called with correct params
    Expected Result: Hook invoked with tool name and args
    Evidence: .sisyphus/evidence/task-31-hook.txt
  ```

  **Commit**: YES
  - Message: `feat(hooks): implement basic hooks system`
  - Files: `src/hooks/emitter.ts`, `src/hooks/emitter.test.ts`

---

- [ ] 32. Skills System

  **What to do**:
  - Implement skill definition format (YAML/Markdown)
  - Implement skill registry
  - Implement skill composition (skills calling skills)
  - Implement conditional branching in workflows
  - Implement parameter passing
  - Implement skill invocation from agents
  - Add built-in skills for common workflows

  **Must NOT do**:
  - 不要过度复杂化 (不是完整的工作流引擎)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 10 (sequential)
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 18, 31

  **References**:
  - `src/agents/` - Agent system
  - `src/hooks/` - Hooks for skill events

  **Acceptance Criteria**:
  - [ ] Skill definition working
  - [ ] Composition working
  - [ ] Conditional branching working
  - [ ] Tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Simple skill executes
    Tool: Bash
    Preconditions: Skills system implemented
    Steps:
      1. Create skill definition with steps
      2. Register skill
      3. Invoke skill
      4. Verify all steps executed
    Expected Result: Skill completes successfully
    Evidence: .sisyphus/evidence/task-32-simple.txt

  Scenario: Skill composition works
    Tool: Bash
    Preconditions: Skill composition implemented
    Steps:
      1. Create skill A
      2. Create skill B that calls skill A
      3. Invoke skill B
      4. Verify skill A was called
    Expected Result: Nested skill execution
    Evidence: .sisyphus/evidence/task-32-compose.txt

  Scenario: Conditional branching works
    Tool: Bash
    Preconditions: Conditional branching implemented
    Steps:
      1. Create skill with if/else branch
      2. Invoke with condition=true
      3. Verify correct branch taken
      4. Invoke with condition=false
      5. Verify other branch taken
    Expected Result: Correct branch executed
    Evidence: .sisyphus/evidence/task-32-branch.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): implement programmable skills system`
  - Files: `src/skills/definition.ts`, `src/skills/executor.ts`, `src/skills/registry.ts`

---

- [ ] 33. Integration Tests + Documentation

  **What to do**:
  - Write end-to-end integration tests
  - Test complete workflows (user → response with tool use)
  - Test session persistence and resumption
  - Test multi-agent workflows
  - Write README.md with:
    - Installation instructions
    - Quick start guide
    - Configuration reference
    - API documentation
  - Create example configurations
  - Create example plugins

  **Must NOT do**:
  - 不要写不必要的文档
  - 不要跳过 E2E 测试

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 10 (final)
  - **Blocks**: None
  - **Blocked By**: All previous tasks

  **References**:
  - All source files
  - `src/__tests__/` - Existing tests

  **Acceptance Criteria**:
  - [ ] E2E tests pass
  - [ ] Coverage > 80%
  - [ ] Documentation complete
  - [ ] Examples work

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: E2E workflow test
    Tool: Bash
    Preconditions: All features implemented
    Steps:
      1. Run `bun test:e2e`
      2. Verify all E2E tests pass
    Expected Result: All E2E tests pass
    Evidence: .sisyphus/evidence/task-33-e2e.txt

  Scenario: Coverage check
    Tool: Bash
    Preconditions: All tests written
    Steps:
      1. Run `bun test --coverage`
      2. Verify coverage > 80%
    Expected Result: Coverage percentage > 80%
    Evidence: .sisyphus/evidence/task-33-coverage.txt

  Scenario: README renders correctly
    Tool: Bash
    Preconditions: README written
    Steps:
      1. Check README.md exists
      2. Verify sections: Installation, Quick Start, Config, API
    Expected Result: All sections present and formatted
    Evidence: .sisyphus/evidence/task-33-readme.txt
  ```

  **Commit**: YES
  - Message: `docs: add documentation and integration tests`
  - Files: `README.md`, `docs/**`, `src/__tests__/e2e/**`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run typecheck` + `bun run lint` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty input, invalid config, rapid commands.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 match. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Files |
|------|----------------|-------|
| 1 | `feat(init): scaffold project structure and configure Bun` | package.json, tsconfig.json, biome.json, src/** |
| 2 | `feat(types): define core interfaces` | src/types/** |
| 3 | `feat(test): setup test infrastructure` | src/__tests__/**, package.json |
| 4 | `feat(providers): implement base provider class` | src/providers/base.ts, src/providers/factory.ts |
| 5 | `feat(providers): implement Claude provider` | src/providers/claude.ts |
| 6 | `feat(providers): implement OpenAI provider` | src/providers/openai.ts |
| 7 | `feat(tools): implement tool system foundation` | src/tools/base.ts, registry.ts, executor.ts |
| 8 | `feat(tools): implement file operations` | src/tools/file.ts |
| 9 | `feat(tools): implement shell execution` | src/tools/shell.ts |
| 10 | `feat(tools): implement search tools` | src/tools/search.ts |
| 11 | `feat(tools): implement git integration` | src/tools/git.ts |
| 12 | `feat(tools): implement web access` | src/tools/web.ts |
| 13 | `feat(tools): implement LSP code intelligence` | src/tools/lsp.ts |
| 14 | `feat(loop): implement agentic loop` | src/loop/agentic.ts |
| 15 | `feat(context): implement context management` | src/context/manager.ts |
| 16 | `feat(mcp): implement MCP client` | src/mcp/client.ts |
| 17 | `feat(session): implement session persistence` | src/session/persistence.ts |
| 18 | `feat(agents): implement agent orchestrator` | src/agents/base.ts, orchestrator.ts, registry.ts |
| 19-23 | `feat(agents): implement [type] agent` | src/agents/[type].ts |
| 24 | `feat(security): implement security layer` | src/security/** |
| 25 | `feat(checkpoint): implement checkpoint system` | src/checkpoint/** |
| 26 | `feat(audit): implement audit logging` | src/audit/** |
| 27 | `feat(cli): implement CLI interface` | src/cli/** |
| 28 | `feat(tui): implement TUI interface` | src/tui/** |
| 29 | `feat(config): implement configuration system` | src/config/** |
| 30 | `feat(plugins): implement plugin system` | src/plugins/** |
| 31 | `feat(hooks): implement hooks system` | src/hooks/** |
| 32 | `feat(skills): implement skills system` | src/skills/** |
| 33 | `docs: add documentation and integration tests` | README.md, docs/**, e2e/** |

---

## Success Criteria

### Verification Commands
```bash
# Type checking
bun run typecheck  # Expected: 0 errors

# Unit tests with coverage
bun test --coverage  # Expected: > 80% coverage, all pass

# Linting
bun run lint  # Expected: 0 errors

# CLI works
nano-claude-code --help  # Expected: Help output

# E2E tests
bun test:e2e  # Expected: All pass
```

### Final Checklist
- [ ] All "Must Have" features implemented and working
- [ ] All "Must NOT Have" guardrails respected
- [ ] All tests pass with 80%+ coverage
- [ ] CLI starts and responds to commands
- [ ] TUI renders and handles input
- [ ] MCP client connects to servers
- [ ] Agents can be orchestrated
- [ ] Sessions persist and resume
- [ ] Security layer enforces rules
- [ ] Documentation complete
