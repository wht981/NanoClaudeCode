## Task 3: Test Infrastructure - Decisions

### Use Bun's Built-in Test Runner (NOT Jest/Vitest)
**Decision**: Use `bun test` instead of external test frameworks
**Rationale**: 
- Zero additional dependencies
- Jest-compatible expect API (familiar syntax)
- Native coverage support
- Faster test execution
- Aligns with Bun-first project setup

### Mock Utilities Organization
**Decision**: Create `src/__tests__/utils/mock-llm.ts` for LLM mocking
**Rationale**:
- Centralizes all mock factories in one place
- Easy to extend with additional mock types
- Separate from test files for reusability
- Follows conventional test utility structure

### Fixtures Directory Structure
**Decision**: Create `src/__tests__/fixtures/` for test data
**Rationale**:
- Keeps test data separate from test logic
- Easy to share fixtures across multiple test files
- Scalable for complex test data

### Test Script Organization
**Decision**: Create separate npm scripts for unit/integration/e2e
**Rationale**:
- Future-proofs test organization
- Allows selective test runs (CI can choose which to run)
- Follows industry conventions
- Easy to extend with different configurations per type

### Coverage Configuration
**Decision**: Use `bun test --coverage` without external .toml config
**Rationale**:
- Bun's default coverage settings are sensible
- Simpler setup without extra configuration files
- Coverage reports show in CLI output
