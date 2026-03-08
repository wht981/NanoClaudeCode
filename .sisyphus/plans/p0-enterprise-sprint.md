# P0 企业级冲刺包 — 安全修复 + 质量闸门 + CLI 贯通

## TL;DR

> **Quick Summary**: 修复 4 个 Critical 安全漏洞（路径遍历、命令注入、全局状态竞争、SSRF），恢复质量闸门（biome.json + 测试基础设施），贯通 CLI one-shot 模式。
> 
> **Deliverables**:
> - 安全加固的 `file.ts`, `search.ts`, `git.ts`, `web.ts`
> - 可工作的 `bun run lint`
> - Integration 和 E2E 测试基础设施
> - CLI `--prompt` 模式接入 AgenticLoop
> 
> **Estimated Effort**: Medium (7-11 hours)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: biome.json → 安全修复（并行）→ CLI 贯通 → 测试

---

## Context

### Original Request
"深入研究这里的代码，查看还有哪些部分没完成或者完成程度不高，我要的是企业级的效果"

### Interview Summary
**Key Discussions**:
- 用户要求企业级效果，不仅功能可用，还要安全、可靠、可观测、可维护
- 深度代码审查发现 5 类关键问题，P0 聚焦最紧迫的 4 个安全漏洞 + 质量闸门

**Research Findings**:
- 路径校验漏洞：`startsWith` 前缀匹配可被同前缀目录绕过
- 全局状态竞争：`process.chdir()` 在并发下有竞争条件
- Git 命令注入：`execSync("git " + args.join(" "))` 无隔离
- SSRF 防护不足：仅 hostname 字符串判断，缺 DNS 解析后校验

### Metis Review
**Identified Gaps** (addressed):
- Symlink 处理：路径校验应考虑 symlink 指向外部
- Windows 路径：需处理大小写和 UNC 路径
- Unicode/编码攻击：需测试 `%2e%2e` 等编码
- Glob API 验证：需确认 Bun Glob 支持 `cwd` 参数
- IPv6 私有地址：SSRF 需处理 `fc00::/7`, `fe80::/10`, `::1`

---

## Work Objectives

### Core Objective
修复所有 Critical 安全漏洞，恢复质量闸门，贯通 CLI 主路径，为 P1/P2 企业级改造奠定安全基础。

### Concrete Deliverables
- `src/tools/file.ts` — 安全的路径校验
- `src/tools/search.ts` — 无竞争条件的搜索
- `src/tools/git.ts` — 安全的 Git 执行
- `src/tools/web.ts` — 增强的 SSRF 防护
- `biome.json` — 可工作的 lint 配置
- `src/__tests__/integration/` — 集成测试目录和冒烟测试
- `src/__tests__/e2e/` — E2E 测试目录和冒烟测试
- `src/cli/index.ts` — CLI one-shot 接入 AgenticLoop

### Definition of Done
- [ ] `bun run lint` 退出码 0
- [ ] `bun test` 所有测试通过（包含新增安全测试）
- [ ] `bun run test:integration` 退出码 0
- [ ] `bun run test:e2e` 退出码 0
- [ ] CLI `--prompt "list files"` 执行工具调用（非占位输出）

### Must Have
- 路径遍历攻击 100% 阻断
- 命令注入攻击 100% 阻断
- SSRF 私有 IP 访问 100% 阻断
- 并发搜索无竞争条件
- Lint 配置可用
- 测试可运行

### Must NOT Have (Guardrails)
- **不改变工具输入/输出 schema** — 只做安全加固
- **不添加新工具** — 仅修复现有工具
- **不修改 AgenticLoop 行为** — CLI 只是接入
- **不实现会话持久化** — P1 范围
- **不接入 MCP** — P1 范围
- **不添加新 lint 规则** — 只修复损坏的配置
- **不添加 rate limiting / 熔断** — P1/P2 范围
- **不接入 security/session/agents 模块** — P1 范围

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test, 511 tests)
- **Automated tests**: YES (Tests-after for security fixes)
- **Framework**: bun test
- **Strategy**: 每个安全修复添加对应的测试用例验证修复有效

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Security fixes**: Use Bash (bun test) — Run security test suites
- **Lint fix**: Use Bash (bun run lint) — Verify exit code 0
- **CLI**: Use Bash — Run CLI with test prompt, capture output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — unblock all other work):
├── Task 1: 修复 biome.json lint 配置 [quick]
└── Task 2: 验证 Bun Glob API 支持 cwd 参数 [quick]

Wave 2 (After Wave 1 — 安全修复，MAX PARALLEL):
├── Task 3: 修复路径遍历漏洞 (file.ts) [deep]
├── Task 4: 修复全局状态竞争 (search.ts) [deep]
├── Task 5: 修复 Git 命令注入 (git.ts) [deep]
└── Task 6: 增强 SSRF 防护 (web.ts) [deep]

Wave 3 (After Wave 2 — 测试基础设施 + CLI):
├── Task 7: 创建 integration 测试基础设施 [quick]
├── Task 8: 创建 e2e 测试基础设施 [quick]
└── Task 9: CLI one-shot 接入 AgenticLoop [unspecified-high]

Wave FINAL (After ALL tasks — 独立验证，4 并行):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA execution (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3-6 (parallel) → Task 9 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | — | 3, 4, 5, 6, 7, 8, 9 |
| 2 | — | 4 |
| 3 | 1 | F1-F4 |
| 4 | 1, 2 | F1-F4 |
| 5 | 1 | F1-F4 |
| 6 | 1 | F1-F4 |
| 7 | 1 | F1-F4 |
| 8 | 1 | F1-F4 |
| 9 | 1, 3-6 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 4 tasks — T3-T6 → `deep`
- **Wave 3**: 3 tasks — T7-T8 → `quick`, T9 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### Wave 1 — 解除阻塞

- [ ] 1. 修复 biome.json lint 配置

  **What to do**:
  - 删除过期键：`indentSize` → 改为 `indentWidth`，`trailingComma` → 改为 `trailingCommas`
  - 删除未知键：`noSelfCompare`, `useValidToString`, `proseWrap`, `singleAttributePerLine`, `singleQuote`（用 `quoteStyle`）
  - 验证 `bun run lint` 退出码 0

  **Must NOT do**:
  - 不添加新的 lint 规则
  - 不改变现有规则的严格程度

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件配置修复，5 分钟任务
  - **Skills**: `[]`
    - 无需额外技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8, 9
  - **Blocked By**: None (can start immediately)

  **References**:
  - `biome.json` — 当前配置文件，需要修复
  - Biome 官方文档 `https://biomejs.dev/reference/configuration/` — 正确的配置键名

  **Acceptance Criteria**:
  - [ ] `bun run lint` 退出码 0（无配置错误）
  - [ ] 现有代码风格不变

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lint 配置有效
    Tool: Bash
    Preconditions: biome.json 已修复
    Steps:
      1. 执行 `bun run lint`
      2. 检查退出码
    Expected Result: 退出码 0，无 "Unknown" 或 "Deprecated" 错误
    Failure Indicators: 退出码非 0，或输出包含配置错误信息
    Evidence: .sisyphus/evidence/task-1-lint-config.txt
  ```

  **Commit**: YES
  - Message: `fix(config): repair biome.json deprecated/unknown keys`
  - Files: `biome.json`
  - Pre-commit: `bun run lint`

- [ ] 2. 验证 Bun Glob API 支持 cwd 参数

  **What to do**:
  - 创建测试脚本验证 `Bun.Glob` 或 `fast-glob` 是否支持 `cwd` 参数
  - 如果不支持，记录替代方案（手动 path.join）
  - 为 Task 4 提供技术决策依据

  **Must NOT do**:
  - 不修改任何生产代码
  - 这只是验证任务

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单 API 验证，10 分钟任务
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/tools/search.ts` — 当前 Glob 使用方式
  - Bun 文档 `https://bun.sh/docs/api/glob` — Glob API

  **Acceptance Criteria**:
  - [ ] 产出技术报告：Glob 是否支持 cwd
  - [ ] 如支持：记录用法示例
  - [ ] 如不支持：记录替代方案

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Glob cwd 支持验证
    Tool: Bash (bun repl)
    Preconditions: None
    Steps:
      1. 创建临时测试脚本：`const glob = new Bun.Glob("**/*.ts"); for await (const f of glob.scan({cwd: "src"})) console.log(f);`
      2. 执行脚本
      3. 检查输出是否为 src 目录下的文件（不含 src/ 前缀）
    Expected Result: 输出相对于 cwd 的文件路径
    Failure Indicators: 报错或输出绝对路径
    Evidence: .sisyphus/evidence/task-2-glob-cwd.txt
  ```

  **Commit**: NO (research task)

### Wave 2 — 安全修复（并行）

- [ ] 3. 修复路径遍历漏洞 (file.ts)

  **What to do**:
  - 替换 `startsWith` 检查为安全的路径验证：
    1. `path.resolve()` 解析路径
    2. `path.normalize()` 规范化
    3. 使用 `path.relative()` 计算相对路径
    4. 检查相对路径不以 `..` 开头
    5. 可选：使用 `fs.realpathSync` 解析 symlink
  - 添加安全测试用例覆盖：
    - `../../../etc/passwd`
    - `....//....//etc/passwd`（双点绕过）
    - `%2e%2e%2f` URL 编码
    - Windows: `..\..\..\Windows\System32`
    - Symlink 指向外部（如果 realpath 启用）

  **Must NOT do**:
  - 不改变工具的输入/输出 schema
  - 不改变正常文件操作的行为

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 安全关键代码，需要仔细审查和全面测试
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 9, F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `src/tools/file.ts:98-108` — 当前 validatePath 实现
  - `src/tools/file.ts:103` — 漏洞位置：`if (!resolvedPath.startsWith(this.workingDirectory))`
  - Node.js path 文档 — `path.relative()` 用法
  - OWASP Path Traversal — 攻击向量参考

  **Acceptance Criteria**:
  - [ ] 所有路径遍历测试用例通过
  - [ ] 现有文件操作测试不变
  - [ ] `bun test src/tools/file.test.ts` 全部通过

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 路径遍历攻击被阻断
    Tool: Bash (bun test)
    Preconditions: file.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/file.test.ts --test-name-pattern "traversal"`
      2. 检查所有攻击向量测试
    Expected Result: 所有测试通过，攻击路径被拒绝
    Failure Indicators: 任何测试失败或攻击路径被接受
    Evidence: .sisyphus/evidence/task-3-path-traversal.txt

  Scenario: 正常文件操作不受影响
    Tool: Bash (bun test)
    Preconditions: file.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/file.test.ts --test-name-pattern "read"`
    Expected Result: 所有正常读取测试通过
    Failure Indicators: 任何正常操作被误阻断
    Evidence: .sisyphus/evidence/task-3-normal-ops.txt
  ```

  **Commit**: YES
  - Message: `fix(security): harden path validation against traversal attacks`
  - Files: `src/tools/file.ts`, `src/tools/__tests__/file.test.ts`
  - Pre-commit: `bun test src/tools/file.test.ts`

- [ ] 4. 修复全局状态竞争 (search.ts)

  **What to do**:
  - 移除 `process.chdir()` 调用（search.ts:166, 226）
  - 改为传递 `cwd` 参数给 Glob：
    - 如果 Task 2 确认 Bun.Glob 支持 cwd：使用 `glob.scan({cwd: searchPath})`
    - 如果不支持：使用 `path.join(searchPath, pattern)` 并过滤结果
  - 同时应用 Task 3 的路径校验修复到 search.ts:143
  - 添加并发搜索测试

  **Must NOT do**:
  - 不改变搜索结果格式
  - 不改变 API 签名

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 并发安全 + 路径安全，需要仔细实现
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: Task 9, F1-F4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `src/tools/search.ts:143` — 路径校验漏洞
  - `src/tools/search.ts:166,226` — `process.chdir()` 调用
  - Task 2 产出 — Glob cwd 支持情况

  **Acceptance Criteria**:
  - [ ] search.ts 中无 `process.chdir` 调用
  - [ ] 路径校验与 file.ts 一致
  - [ ] 并发搜索测试通过
  - [ ] `bun test src/tools/search.test.ts` 全部通过

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 无 process.chdir 调用
    Tool: Bash (grep)
    Preconditions: search.ts 已修复
    Steps:
      1. 执行 `grep -n "process.chdir" src/tools/search.ts`
    Expected Result: 无输出（没有匹配）
    Failure Indicators: 有任何匹配行
    Evidence: .sisyphus/evidence/task-4-no-chdir.txt

  Scenario: 并发搜索无竞争
    Tool: Bash (bun test)
    Preconditions: search.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/search.test.ts --test-name-pattern "concurrent"`
    Expected Result: 并发测试通过
    Failure Indicators: 竞争条件导致错误结果
    Evidence: .sisyphus/evidence/task-4-concurrent.txt
  ```

  **Commit**: YES
  - Message: `fix(security): eliminate process.chdir race condition in search`
  - Files: `src/tools/search.ts`, `src/tools/__tests__/search.test.ts`
  - Pre-commit: `bun test src/tools/search.test.ts`

- [ ] 5. 修复 Git 命令注入 (git.ts)

  **What to do**:
  - 替换 `execSync(\`git ${args.join(' ')}\`)` 为安全执行：
    - 使用 `Bun.spawn(["git", ...args])` 或 `child_process.spawn`
    - 参数作为数组传递，不经过 shell 解析
  - 添加执行超时（30 秒）
  - 添加命令注入测试用例：
    - 文件名含 `;rm -rf /`
    - 文件名含 `$(whoami)`
    - 文件名含换行符

  **Must NOT do**:
  - 不改变 Git 工具的功能
  - 不改变输出格式

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 安全关键，需要处理各种 shell 转义场景
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: Task 9, F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `src/tools/git.ts:117` — 漏洞位置：`execSync(\`git ${args.join(' ')}\`)`
  - Bun.spawn 文档 — 安全执行外部命令
  - OWASP Command Injection — 攻击向量参考

  **Acceptance Criteria**:
  - [ ] git.ts 中无 `execSync(\`git ${...}\`)` 模式
  - [ ] 使用参数数组执行
  - [ ] 命令注入测试通过
  - [ ] `bun test src/tools/git.test.ts` 全部通过

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 无 shell 字符串拼接
    Tool: Bash (grep)
    Preconditions: git.ts 已修复
    Steps:
      1. 执行 `grep -n "execSync.*git.*join" src/tools/git.ts`
    Expected Result: 无输出
    Failure Indicators: 有任何匹配
    Evidence: .sisyphus/evidence/task-5-no-shell-concat.txt

  Scenario: 命令注入攻击被阻断
    Tool: Bash (bun test)
    Preconditions: git.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/git.test.ts --test-name-pattern "injection"`
    Expected Result: 所有注入测试通过
    Failure Indicators: 任何注入攻击成功
    Evidence: .sisyphus/evidence/task-5-injection.txt
  ```

  **Commit**: YES
  - Message: `fix(security): prevent command injection in git tool`
  - Files: `src/tools/git.ts`, `src/tools/__tests__/git.test.ts`
  - Pre-commit: `bun test src/tools/git.test.ts`

- [ ] 6. 增强 SSRF 防护 (web.ts)

  **What to do**:
  - 增强 `isPrivateIP` 函数：
    1. 解析 URL 获取 hostname
    2. DNS 解析获取实际 IP
    3. 检查解析后的 IP 是否为私有地址
    4. 支持 IPv6 私有地址：`::1`, `fc00::/7`, `fe80::/10`
    5. 处理 IPv6 映射的 IPv4：`::ffff:10.0.0.1`
  - 添加 SSRF 测试用例：
    - `http://localhost/`, `http://127.0.0.1/`
    - `http://[::1]/`
    - DNS 指向私有 IP 的域名（需 mock）

  **Must NOT do**:
  - 不阻断正常公网请求
  - 不改变成功请求的响应格式

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 网络安全，需要处理 DNS 和 IPv6 边缘情况
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 9, F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `src/tools/web.ts:43-71` — 当前 SSRF 防护
  - `src/tools/web.ts:isPrivateIP()` — 需要增强
  - OWASP SSRF — 攻击向量参考

  **Acceptance Criteria**:
  - [ ] DNS 解析后检查 IP
  - [ ] IPv6 私有地址被阻断
  - [ ] `bun test src/tools/web.test.ts` 全部通过

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SSRF 私有 IP 被阻断
    Tool: Bash (bun test)
    Preconditions: web.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/web.test.ts --test-name-pattern "ssrf"`
    Expected Result: 所有 SSRF 测试通过
    Failure Indicators: 任何私有 IP 访问成功
    Evidence: .sisyphus/evidence/task-6-ssrf.txt

  Scenario: 公网请求正常
    Tool: Bash (bun test)
    Preconditions: web.ts 已修复
    Steps:
      1. 执行 `bun test src/tools/web.test.ts --test-name-pattern "fetch"`
    Expected Result: 公网请求测试通过
    Failure Indicators: 正常请求被阻断
    Evidence: .sisyphus/evidence/task-6-public-fetch.txt
  ```

  **Commit**: YES
  - Message: `fix(security): enhance SSRF protection with DNS resolution check`
  - Files: `src/tools/web.ts`, `src/tools/__tests__/web.test.ts`
  - Pre-commit: `bun test src/tools/web.test.ts`

### Wave 3 — 测试基础设施 + CLI 贯通

- [ ] 7. 创建 integration 测试基础设施

  **What to do**:
  - 创建 `src/__tests__/integration/` 目录
  - 创建冒烟测试：ToolExecutor + 单个工具执行
  - 测试应自包含（使用临时目录，自动清理）

  **Must NOT do**:
  - 不需要完整覆盖
  - 不使用真实 API（mock provider）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的测试脚手架
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `src/__tests__/` — 现有测试结构
  - `package.json` scripts — test:integration 定义

  **Acceptance Criteria**:
  - [ ] 目录存在
  - [ ] 至少 1 个测试文件
  - [ ] `bun run test:integration` 退出码 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Integration 测试可运行
    Tool: Bash
    Preconditions: 目录和测试已创建
    Steps:
      1. 执行 `bun run test:integration`
    Expected Result: 退出码 0，至少 1 个测试通过
    Failure Indicators: 退出码非 0 或无测试
    Evidence: .sisyphus/evidence/task-7-integration.txt
  ```

  **Commit**: YES (grouped with Task 8)
  - Message: `test: add integration and e2e test infrastructure`
  - Files: `src/__tests__/integration/`

- [ ] 8. 创建 e2e 测试基础设施

  **What to do**:
  - 创建 `src/__tests__/e2e/` 目录
  - 创建冒烟测试：CLI 启动 + 基本响应
  - 测试应自包含，不需要真实 API key

  **Must NOT do**:
  - 不需要 Playwright（CLI 测试）
  - 不测试 TUI（太复杂）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的测试脚手架
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `src/__tests__/` — 现有测试结构
  - `package.json` scripts — test:e2e 定义

  **Acceptance Criteria**:
  - [ ] 目录存在
  - [ ] 至少 1 个测试文件
  - [ ] `bun run test:e2e` 退出码 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E 测试可运行
    Tool: Bash
    Preconditions: 目录和测试已创建
    Steps:
      1. 执行 `bun run test:e2e`
    Expected Result: 退出码 0，至少 1 个测试通过
    Failure Indicators: 退出码非 0 或无测试
    Evidence: .sisyphus/evidence/task-8-e2e.txt
  ```

  **Commit**: YES (grouped with Task 7)
  - Message: `test: add integration and e2e test infrastructure`
  - Files: `src/__tests__/e2e/`

- [ ] 9. CLI one-shot 接入 AgenticLoop

  **What to do**:
  - 修改 `src/cli/index.ts` 的 one-shot 处理：
    1. 创建 Provider 实例
    2. 创建 ToolExecutor + 工具集（至少 file, search, shell）
    3. 创建 AgenticLoop 实例
    4. 调用 `loop.run(prompt)` 并流式输出到 stdout
  - 处理错误：API key 缺失、provider 连接失败

  **Must NOT do**:
  - 不实现会话持久化
  - 不添加新 CLI 参数
  - 不修改 TUI 代码

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解 AgenticLoop 和 Provider 的接口
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after security fixes)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 3, 4, 5, 6

  **References**:
  - `src/cli/index.ts:77-82` — 当前占位实现
  - `src/tui/index.ts:280-310` — TUI 中 AgenticLoop 的使用方式
  - `src/loop/agentic.ts` — AgenticLoop 接口
  - `src/tools/executor.ts` — ToolExecutor 创建

  **Acceptance Criteria**:
  - [ ] `--prompt` 执行真实工具调用
  - [ ] 输出不含 "Provider-backed loop integration"
  - [ ] 缺少 API key 时优雅报错

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CLI one-shot 执行工具
    Tool: Bash
    Preconditions: 有效的 API key 环境变量
    Steps:
      1. 执行 `bun src/index.ts --prompt "list files in current directory" 2>&1`
      2. 检查输出
    Expected Result: 输出包含目录列表，不含占位文本
    Failure Indicators: 输出包含 "Provider-backed loop integration"
    Evidence: .sisyphus/evidence/task-9-cli-oneshot.txt

  Scenario: 缺少 API key 优雅报错
    Tool: Bash
    Preconditions: 无 API key 环境变量
    Steps:
      1. 执行 `ANTHROPIC_API_KEY= OPENAI_API_KEY= bun src/index.ts --prompt "hello" 2>&1`
    Expected Result: 输出包含明确的错误信息
    Failure Indicators: 崩溃或无意义的错误
    Evidence: .sisyphus/evidence/task-9-missing-key.txt
  ```

  **Commit**: YES
  - Message: `feat(cli): wire one-shot mode to AgenticLoop`
  - Files: `src/cli/index.ts`
  - Pre-commit: `bun test src/cli/`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (run security tests, lint). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run typecheck` + `bun run lint` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA Execution** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task. Run security attack tests manually (path traversal, injection, SSRF). Verify CLI works end-to-end. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Security Tests [N/N] | CLI [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Files |
|------|----------------|-------|
| 1 | `fix(config): repair biome.json deprecated/unknown keys` | `biome.json` |
| 3 | `fix(security): harden path validation against traversal attacks` | `src/tools/file.ts`, `src/tools/__tests__/file.test.ts` |
| 4 | `fix(security): eliminate process.chdir race condition in search` | `src/tools/search.ts`, `src/tools/__tests__/search.test.ts` |
| 5 | `fix(security): prevent command injection in git tool` | `src/tools/git.ts`, `src/tools/__tests__/git.test.ts` |
| 6 | `fix(security): enhance SSRF protection with DNS resolution check` | `src/tools/web.ts`, `src/tools/__tests__/web.test.ts` |
| 7-8 | `test: add integration and e2e test infrastructure` | `src/__tests__/integration/`, `src/__tests__/e2e/` |
| 9 | `feat(cli): wire one-shot mode to AgenticLoop` | `src/cli/index.ts` |

---

## Success Criteria

### Verification Commands
```bash
# Lint passes
bun run lint
# Expected: exit code 0

# All tests pass
bun test
# Expected: 520+ tests pass (including new security tests)

# Integration tests pass
bun run test:integration
# Expected: exit code 0, at least 1 test

# E2E tests pass
bun run test:e2e
# Expected: exit code 0, at least 1 test

# CLI one-shot works
bun src/index.ts --prompt "list files in current directory" 2>&1
# Expected: contains tool execution output, NOT "Provider-backed loop integration"

# Security: path traversal blocked
bun test --test-name-pattern "traversal"
# Expected: all pass

# Security: command injection blocked
bun test --test-name-pattern "injection"
# Expected: all pass

# Security: SSRF blocked
bun test --test-name-pattern "ssrf"
# Expected: all pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (unit + security + integration + e2e)
- [ ] Lint passes
- [ ] CLI functional
