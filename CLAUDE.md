# CLAUDE.md — Scrutari Development Guide

## What is Scrutari?

Scrutari is an interactive financial analysis CLI powered by LLMs. Users type `scrutari` to open a chat where they can analyze stocks, fetch quotes, search SEC filings, and run multi-stage research pipelines — all through natural language. An LLM orchestrator decides which tools to invoke and streams results in real-time.

## Architecture

```
packages/
  core/     Pipeline engine, skill loader, model router, cost tracker,
            verification system, output formatters (Markdown, JSON, DOCX)

  tools/    Built-in tool implementations (SEC EDGAR, Yahoo Finance, news)
            with retry logic and rate limiting

  mcp/      MCP client for stdio and HTTP/SSE transports
            with tool adapter layer

  cli/      Interactive chat interface with Ink TUI, LLM orchestrator,
            session persistence, and skill discovery.
            Published to npm as the `scrutari` binary.
```

Dependency flow: `cli → core, tools, mcp`. No circular dependencies between packages.

The CLI bundles `core`, `tools`, and `mcp` into a single ESM file via tsup. Only runtime npm dependencies are externalized.

## Build & Run

```bash
npm install                    # install all workspace deps
npx turbo run build            # build all 4 packages (core/tools/mcp first, then cli)
npx turbo run build --force    # rebuild everything from scratch

# Run tests
cd packages/core && npx vitest run     # 17 test files
cd packages/tools && npx vitest run    # 5 test files
cd packages/mcp && npx vitest run      # 3 test files
cd packages/cli && npx vitest run      # 1 test file (config loader)

# Type check without building
cd packages/cli && npx tsc --noEmit

# Run the CLI locally
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --version
```

Build order matters: `core`, `tools`, `mcp` build with `tsc`, then `cli` bundles them with `tsup`. Turbo handles this via `dependsOn: ["^build"]`.

## Testing — Every Code Path Must Have Tests

**This is non-negotiable.** Every function, every branch, every error path must be covered by tests.

### Rules

1. **Write tests for every change.** If you add a function, add tests. If you modify behavior, update existing tests and add new ones for the new behavior. If you fix a bug, add a regression test that fails without the fix.

2. **Test files live next to source files.** `foo.ts` → `foo.test.ts` in the same directory. No separate `__tests__` folders.

3. **Test the behavior, not the implementation.** Tests should verify what a function does, not how it does it. This makes refactoring safe.

4. **Cover edge cases.** Empty inputs, null/undefined, boundary values, error conditions. If a function can fail, test that it fails correctly.

5. **Keep tests simple and readable.** Each test should test one thing. Use descriptive names: `it('returns empty array when no filings match')` not `it('works')`.

6. **No skipped tests.** If a test is broken, fix it. If it's not relevant, delete it. Never commit `it.skip()` or `describe.skip()`.

7. **Mock external dependencies, not internal logic.** Mock HTTP calls, file system, LLM APIs. Don't mock the function you're testing.

### Current coverage gaps that need fixing

The CLI package has only 1 test file (config loader). The following need tests:

- `chat/session/storage.ts` — save, load, list, delete sessions
- `chat/orchestrator/system-prompt.ts` — prompt construction with varying inputs
- `chat/orchestrator/tools.ts` — tool definitions (skill finding, pipeline creation)
- `chat/components/*.tsx` — React component rendering (use `ink-testing-library`)
- `chat/hooks/*.ts` — hook behavior (useSession, useOrchestrator)

### Test framework

- **vitest** for all tests
- `describe` / `it` blocks
- Import from `vitest`: `describe`, `it`, `expect`, `vi` (for mocks/spies)
- Run: `npx vitest run` (single run) or `npx vitest` (watch mode)

## Documentation — Update After Every Code Change

When you change code, update the relevant documentation **in the same commit**. Documentation is not a follow-up task — it's part of the change.

### What to update

| Change | Update |
|--------|--------|
| New CLI flag or option | `README.md` CLI Reference section, `packages/cli/README.md`, `printHelp()` in `index.ts` |
| New tool or tool group | `README.md` Built-in Tools table, tool's barrel `index.ts` |
| New skill | `README.md` Built-in Skills table, add YAML to `skills/` |
| New config option | `README.md` Configuration section, `config/schema.ts` |
| Changed pipeline behavior | `README.md` Pipeline architecture section |
| New component or UI change | `packages/cli/README.md` example session if the output changed |
| Changed exports | Barrel `index.ts` file for the package |
| New dependency | Verify `tsup.config.ts` externals are correct |

### README structure

- **Root `README.md`** — Full documentation, GitHub landing page. Includes the owl mascot, badges, and comprehensive reference.
- **`packages/cli/README.md`** — npm package page. Concise version focused on installation and usage.

Both READMEs show the example session output. If the chat UI changes, update the example in both.

## Code Style

### Simple is better than complex

- Write the simplest code that works. Three similar lines are better than a premature abstraction.
- Don't add features, utilities, or configurability that isn't needed right now.
- Don't add error handling for scenarios that can't happen. Trust internal code.
- If a function is getting long, break it into smaller functions with clear names — but only if it actually improves readability.

### Naming

- `camelCase` for functions and variables
- `PascalCase` for classes, interfaces, types, React components
- `UPPER_SNAKE_CASE` for constants (`MODEL_PRICING`, `TOOL_GROUP_MAP`)
- Verb-first for functions: `loadSkillFile`, `buildSystemPrompt`, `searchFilings`
- Descriptive names over short names: `extractKeywords` not `getKw`

### Imports

- ES modules with `.js` extensions on relative imports: `import { foo } from './bar.js'`
- Workspace packages: `import { PipelineEngine } from '@scrutari/core'`
- Named exports preferred. Barrel re-exports in `index.ts` files.
- Type-only imports: `import type { Config } from './config/index.js'`
- Group imports: external deps first, then workspace deps, then relative imports.

### TypeScript

- Strict mode enabled. No `any` unless absolutely unavoidable (and document why).
- Zod schemas for runtime validation (config, skill YAML, API responses, tool params).
- Derive types from Zod schemas: `type Skill = z.infer<typeof SkillSchema>`
- Interfaces for internal API contracts. Types for unions and computed types.

### Error handling

- Custom error classes with descriptive `name` property:
  ```ts
  export class SkillLoadError extends Error {
    name = 'SkillLoadError';
  }
  ```
- Never swallow errors silently. Either handle them or let them propagate.
- Error messages include context: file paths, stage names, ticker symbols.
- Use try-catch at boundaries (API calls, file I/O, user input). Don't wrap pure logic.

### Async

- `async/await` everywhere. No `.then()` chains.
- `Promise.all()` for parallel independent operations.
- Pass `AbortSignal` for cancellable operations (LLM calls, pipeline runs).

### React (Ink TUI)

- Functional components with hooks. No class components.
- Props interfaces defined above the component.
- Blue theme color for all UI accents (borders, prompts, headings).
- Keep components small. Extract logic into hooks.

## Key Patterns

### Pipeline execution

The `PipelineEngine` in `packages/core/src/pipeline/engine.ts` runs skill stages as a DAG. It emits events (`stage:start`, `stage:stream`, `stage:complete`, `stage:error`) that the CLI subscribes to for real-time progress display. Budget is enforced before each LLM call.

### Tool system

Tools are defined as `{ name, description, parameters: ZodSchema, execute }` in `packages/tools`. The `ToolRegistry` organizes them into groups (`edgar`, `market-data`, `news`). Skills declare tool dependencies in YAML. The pipeline resolves tools at runtime via `resolveTools()`.

### LLM orchestrator

The chat uses AI SDK v6 `streamText` with `fullStream` to get both text and reasoning tokens. Tools are plain objects with `inputSchema` (Zod) and `execute`. The agent loop runs with `stopWhen: stepCountIs(10)` to prevent infinite tool chains.

Key API mapping (AI SDK v6 — these are easy to get wrong):
- `ModelMessage` not `CoreMessage`
- `stepCountIs()` not `maxSteps`
- `inputSchema` not `parameters` on tools
- Stream parts: `.text` property (not `.delta` or `.textDelta`)
- `reasoning-delta` type (not `reasoning`)
- Tool-call: `input` field (not `args`)
- Tool-result: `output` field (not `result`)

### Skill YAML

Skills define multi-stage LLM pipelines declaratively. The loader validates against a Zod schema, checks for DAG cycles via DFS, and substitutes `{variables}` from inputs. Skills live in `skills/` (built-in) or `~/.scrutari/skills/` (user). User skills override built-in skills with the same name.

### Session persistence

Chat sessions are JSON files in `~/.scrutari/sessions/`. The `useSession` hook auto-saves every 30 seconds and on exit. Sessions can be resumed via `--continue` (latest) or `--resume <id>`.

### Cost tracking

Every LLM call records input/output tokens. The `CostTracker` in `packages/core/src/router/cost.ts` accumulates cost per stage. Built-in pricing for Claude and GPT models. Pipeline stops with partial results if budget is exceeded.

## File Layout Reference

```
packages/core/src/
  index.ts                          Barrel exports
  pipeline/engine.ts                PipelineEngine class (EventEmitter-based)
  router/model-router.ts            Task → model routing
  router/llm.ts                     LLM call abstraction
  router/cost.ts                    Token pricing, budget tracking
  router/providers.ts               Anthropic/OpenAI provider factory
  router/retry.ts                   Exponential backoff
  skills/schema.ts                  Zod schema for skill YAML
  skills/loader.ts                  YAML parse, DAG validation, variable substitution
  skills/registry.ts                In-memory skill map
  skills/types.ts                   Type definitions
  verification/extractor.ts         LLM claim extraction
  verification/linker.ts            Claim-to-source linking
  verification/reporter.ts          Verification report generation
  verification/types.ts             Claim, SourceReference types
  output/writer.ts                  File writing orchestration
  output/markdown.ts                Markdown with frontmatter
  output/json.ts                    JSON output
  output/docx.ts                    DOCX generation

packages/tools/src/
  index.ts                          Barrel exports
  types.ts                          ToolDefinition, ToolContext, ToolResult
  registry.ts                       ToolRegistry class
  retry.ts                          Tool call retry logic
  edgar/client.ts                   SEC EDGAR API client
  edgar/tools.ts                    searchFilings, getFiling, getFinancials
  market-data/client.ts             Stock quote/OHLC client
  market-data/tools.ts              getQuote, getOHLC, getHistorical
  news/client.ts                    News API client
  news/tools.ts                     searchNews

packages/mcp/src/
  index.ts                          Barrel exports
  types.ts                          MCPServerConfig, MCPToolInfo
  client.ts                         MCPClientManager
  adapter.ts                        MCP tool → ToolDefinition adapter
  stdio.ts                          Stdio transport factory
  http.ts                           HTTP/SSE transport factory

packages/cli/src/
  index.ts                          Entry point (parseArgs, config load, render)
  context.ts                        Global config singleton
  config/schema.ts                  Zod config schema
  config/loader.ts                  YAML loading, env var expansion
  chat/ChatApp.tsx                  Root Ink component
  chat/types.ts                     ChatMessage, OrchestratorConfig
  chat/index.ts                     Barrel exports
  chat/components/WelcomeBanner.tsx  Startup banner with owl mascot
  chat/components/MessageList.tsx    Message history
  chat/components/MessageBubble.tsx  Single message display
  chat/components/InputPrompt.tsx    Text input with ❯ prompt
  chat/components/ThinkingBlock.tsx  LLM reasoning display
  chat/components/PipelineProgress.tsx  Pipeline stage tracker
  chat/hooks/useSession.ts          Session lifecycle + auto-save
  chat/hooks/useOrchestrator.ts     LLM streaming state
  chat/orchestrator/agent.ts        streamText agent loop
  chat/orchestrator/system-prompt.ts  Dynamic prompt builder
  chat/orchestrator/tools.ts        Chat-level tool definitions
  chat/session/storage.ts           JSON file persistence
  chat/session/types.ts             Session, SessionSummary

skills/
  deep-dive.yaml                    6-stage full company analysis
  comp-analysis.yaml                4-stage competitive comparison
  earnings-review.yaml              4-stage earnings deep dive
  thesis-gen.yaml                   3-stage investment thesis
```

## Common Tasks

### Adding a new built-in tool

1. Create `packages/tools/src/<name>/client.ts` — API client with retry
2. Create `packages/tools/src/<name>/tools.ts` — tool definitions with Zod schemas
3. Create `packages/tools/src/<name>/index.ts` — barrel export
4. Register the tool group in `packages/tools/src/registry.ts`
5. Export from `packages/tools/src/index.ts`
6. Write tests in `packages/tools/src/<name>/tools.test.ts`
7. Update `README.md` Built-in Tools table

### Adding a new skill

1. Create `skills/<name>.yaml` following the skill schema
2. Test it loads: import `loadSkillFile` and `scanSkillFiles` from `@scrutari/core`
3. Update `README.md` Built-in Skills table

### Adding a new CLI feature

1. Implement the feature
2. Write tests
3. Update `printHelp()` in `packages/cli/src/index.ts` if new flags
4. Update `README.md` CLI Reference section
5. Update `packages/cli/README.md`
6. Update the example session in both READMEs if output changed

### Modifying the chat UI

1. Edit components in `packages/cli/src/chat/components/`
2. Blue theme: borders, prompts, headings all use `color="blue"`
3. Update the example session in both READMEs if the visual output changed
4. Write or update component tests

## Pre-commit Checklist

Before every commit, verify:

1. **`npx tsc --noEmit`** — TypeScript compiles with no errors
2. **`npx turbo run build --force`** — All 4 packages build successfully
3. **`npx vitest run`** — All tests pass (run in each package that changed)
4. **Tests added** — New code has corresponding tests
5. **Docs updated** — READMEs, help text, and comments reflect the change
6. **No `any` types** — Use proper types or document why `any` is unavoidable
7. **No unused imports** — Clean up after refactoring
8. **No console.log** — Use proper logging or remove debug output
