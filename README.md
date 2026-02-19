<p align="center">
  <h1 align="center">scrutari</h1>
  <p align="center">
    Interactive financial analysis powered by LLMs
    <br />
    <a href="#quick-start">Quick Start</a> &middot; <a href="#built-in-skills">Skills</a> &middot; <a href="#custom-skills">Custom Skills</a> &middot; <a href="#configuration">Configuration</a>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@foundationalresearch/scrutari"><img src="https://img.shields.io/npm/v/@foundationalresearch/scrutari" alt="npm version" /></a>
  <a href="https://github.com/FoundationalResearch/scrutari/actions"><img src="https://img.shields.io/github/actions/workflow/status/FoundationalResearch/scrutari/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/FoundationalResearch/scrutari/blob/main/packages/cli/LICENSE"><img src="https://img.shields.io/npm/l/@foundationalresearch/scrutari" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@foundationalresearch/scrutari"><img src="https://img.shields.io/node/v/@foundationalresearch/scrutari" alt="Node version" /></a>
</p>

---

Scrutari is an interactive financial analysis CLI. Type `scrutari` to open a chat where you can ask questions, run analysis pipelines, fetch stock quotes, and search SEC filings — all through natural language. An LLM orchestrator decides which tools to invoke and streams results in real-time.

Under the hood, Scrutari executes multi-stage LLM research pipelines defined as YAML skill files. It handles data gathering from SEC EDGAR and market feeds, multi-model reasoning chains, claim verification, cost tracking, and professional report generation.

## Quick Start

```bash
# Zero config — just set your API key and go
export ANTHROPIC_API_KEY=sk-ant-...
npx @foundationalresearch/scrutari
```

Or install globally:

```bash
npm install -g @foundationalresearch/scrutari
scrutari
```

That's it. No config file needed. Scrutari auto-detects `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from your environment and opens an interactive chat.

### Example session

```
scrutari v0.1.0
Model: claude-sonnet-4-20250514  Provider: anthropic
Ask me to analyze any stock, e.g. "analyze NVDA". Press Ctrl+C to exit.

❯ analyze NVDA
✓ run_pipeline
  ┌─────────────────────────────────────────────┐
  │ Pipeline: NVDA (deep-dive)                  │
  │ ✓ gather      3s   $0.02  claude-haiku      │
  │ ✓ extract     2s   $0.01  claude-haiku      │
  │ ✓ analyze     8s   $0.06  claude-sonnet     │
  │ ✓ verify      5s   $0.03  claude-sonnet     │
  │ ✓ synthesize  6s   $0.04  claude-sonnet     │
  │ ✓ format      2s   $0.01  claude-haiku      │
  │ ✓ Pipeline complete — $0.17                 │
  └─────────────────────────────────────────────┘

Here's the analysis for NVIDIA (NVDA):

## Key Findings
- Revenue grew 122% YoY driven by data center demand...
- Gross margin expanded to 78.4%...
...

❯ what is AAPL trading at?
Apple (AAPL) is currently trading at $189.84, up +1.23 (+0.65%).
Market cap: $2.94T, Volume: 52.3M

❯ search for recent TSLA news
Here are the latest Tesla headlines...
```

## How It Works

When you type a message, Scrutari's LLM orchestrator interprets your intent and automatically invokes the right tools:

| You type | Scrutari does |
|----------|--------------|
| "analyze NVDA" | Runs the `deep-dive` pipeline (6 LLM stages with data gathering) |
| "what is AAPL trading at?" | Calls `get_quote` for a real-time stock price |
| "search TSLA SEC filings" | Calls `search_filings` on SEC EDGAR |
| "find news about AI chips" | Calls `search_news` for recent articles |
| "what skills are available?" | Calls `list_skills` to show all pipelines |
| "show my config" | Calls `manage_config` to display settings |

### Pipeline architecture

Analysis pipelines execute as a **directed acyclic graph (DAG) of LLM stages**, where each stage can call external tools, use different models and temperatures, and consume outputs from upstream stages:

```
gather ──> extract ──> analyze ──> verify ──> synthesize ──> format
  │                       │           │            │
  │ Haiku + tools         │ Sonnet    │ Sonnet     │ Haiku
  │ (fast data fetch)     │ (reason)  │ (verify)   │ (format)
```

The pipeline engine resolves the DAG topologically, tracks token usage and cost per stage, enforces budget limits, and produces partial results if a stage fails.

## Sessions

Scrutari automatically saves your chat history. Resume where you left off:

```bash
# Resume the most recent session
scrutari --continue

# Resume a specific session
scrutari --resume <session-id>
```

Sessions are stored as JSON files in `~/.scrutari/sessions/`.

## Built-in Skills

| Skill | Stages | Description |
|-------|--------|-------------|
| **`deep-dive`** | 6 | Full company analysis: gather SEC filings + market data, extract metrics, analyze financials, verify claims, synthesize narrative, format report |
| **`earnings-review`** | 4 | Quarterly earnings analysis: fetch earnings release + transcript, extract key metrics, analyze beat/miss patterns, produce summary |
| **`comp-analysis`** | 4 | Competitive comparison: gather data for multiple tickers, normalize metrics, head-to-head comparison, ranked report |
| **`thesis-gen`** | 3 | Investment thesis generation: research data gathering, bull/bear case analysis, structured thesis with price targets |

In the chat, just ask naturally:

```
❯ analyze AAPL
❯ run a deep dive on MSFT
❯ generate an investment thesis for TSLA
❯ what skills are available?
```

## Built-in Tools

Scrutari ships with data integration tools that the orchestrator and pipeline stages can invoke:

| Tool Group | Tools | Data Source |
|-----------|-------|-------------|
| **edgar** | `edgar_search_filings`, `edgar_get_filing`, `edgar_get_financials` | SEC EDGAR (10-K, 10-Q, 8-K filings, XBRL financials) |
| **market-data** | `market_data_get_quote`, `market_data_get_history`, `market_data_get_financials` | Yahoo Finance (price, volume, market cap, historical OHLCV, financial statements) |
| **news** | `news_search` | Brave Search (recent news with configurable lookback window) |

Tools handle rate limiting, retries with exponential backoff, and stale cache fallback automatically.

## Output Formats

Pipeline runs produce reports in multiple formats. The orchestrator chooses the default, but you can configure it:

- **Markdown** (default) — YAML frontmatter, inline verification badges, footnoted citations, per-stage execution metadata
- **JSON** — Structured machine-readable output with metadata and per-stage results
- **DOCX** — Professionally formatted Word document with cover page, table of contents, and verification tables

Both Markdown and DOCX include a **verification section** when the skill has a `verify` stage — claims are extracted, cross-referenced, and annotated with confidence scores and source citations.

## Configuration

### Zero-config mode

When `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your environment, Scrutari works immediately with sensible defaults:

| Setting | Default |
|---------|---------|
| Provider | Anthropic |
| Model | `claude-sonnet-4-20250514` |
| Budget cap | $5.00 per run |
| Output format | Markdown |
| Output directory | `./output` |

### Config file

For full control, create `~/.scrutari/config.yaml`:

```yaml
providers:
  anthropic:
    api_key: env:ANTHROPIC_API_KEY    # reads from environment
    default_model: claude-sonnet-4-20250514
  openai:
    api_key: env:OPENAI_API_KEY
    default_model: gpt-4o

defaults:
  provider: anthropic
  model: claude-sonnet-4-20250514
  max_budget_usd: 5.0
  output_format: markdown             # markdown | json | docx
  output_dir: ./output

skills_dir: ~/.scrutari/skills

mcp:
  servers: []
```

API keys support multiple formats: `env:VAR_NAME`, `$VAR_NAME`, `${VAR_NAME}`, or literal strings.

You can also manage config from within the chat:

```
❯ show my config
❯ set the budget to $10
```

## Custom Skills

Create YAML files in `~/.scrutari/skills/` to define your own analysis pipelines:

```yaml
name: sector-overview
version: "1.0"
description: High-level sector analysis

inputs:
  - name: ticker
    type: string
    required: true
  - name: depth
    type: string
    default: standard

tools_required:
  - market-data
tools_optional:
  - news

stages:
  - name: research
    model: claude-sonnet-4-20250514
    temperature: 0.2
    tools:
      - market-data
      - news
    prompt: |
      Research the sector that {ticker} operates in.
      Gather market data and recent industry news.
      Depth: {depth}.
    output_format: json

  - name: analyze
    model: claude-sonnet-4-20250514
    temperature: 0.4
    input_from: [research]
    prompt: |
      Analyze the sector landscape based on the research data.
      Identify trends, key players, and competitive dynamics.
    output_format: markdown

  - name: report
    model: claude-haiku-4-5-20251001
    temperature: 0
    input_from: [analyze]
    prompt: |
      Format the analysis into a structured sector overview report
      for {ticker}'s industry with tables and key metrics.
    output_format: markdown

output:
  primary: report
  format: markdown
  save_intermediate: true
  filename_template: "{ticker}-sector-overview"
```

Then in the chat:

```
❯ run a sector overview on NVDA
```

User skills override built-in skills with the same name.

### Skill schema reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier |
| `version` | string | Semantic version |
| `description` | string | Human-readable description |
| `inputs` | array | Input parameters with `name`, `type` (`string`, `string[]`, `number`, `boolean`), `required`, `default` |
| `tools_required` | string[] | Tool groups that must be available |
| `tools_optional` | string[] | Tool groups used if available |
| `stages` | array | Pipeline stages (minimum 1) |
| `output` | object | `primary` (stage name), `format`, `save_intermediate`, `filename_template` |

**Stage fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique stage identifier |
| `model` | string | LLM model ID |
| `temperature` | number | 0.0 - 2.0 |
| `tools` | string[] | Tool groups this stage can invoke |
| `prompt` | string | Prompt template with `{variable}` substitution |
| `output_format` | string | `json`, `markdown`, or `text` |
| `max_tokens` | number | Max output tokens |
| `input_from` | string[] | Upstream stage dependencies |

## MCP Servers

Extend Scrutari with external data sources via the [Model Context Protocol](https://modelcontextprotocol.io/):

```yaml
mcp:
  servers:
    - name: bloomberg
      command: npx
      args: ["-y", "@bloomberg/mcp-server"]

    - name: custom-data
      url: http://localhost:3001/mcp
```

MCP tools are automatically registered and can be referenced in skill `tools` fields by server name. Servers support both **stdio** (local process) and **HTTP/SSE** (remote) transports with automatic timeout (30s) and retry on transient failures.

## CLI Reference

```
scrutari [options]

Options:
  --continue          Resume the most recent session
  --resume <id>       Resume a specific session by ID
  -c, --config        Path to config file
  -v, --verbose       Show LLM reasoning tokens
  --version           Print version
  --help              Show help

Examples:
  scrutari                    Open interactive chat
  scrutari --continue         Resume last session
  scrutari --verbose          Show LLM thinking tokens
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Ctrl+C** (while processing) | Abort current LLM response |
| **Ctrl+C** (at prompt) | Save session and exit |

### Verbose mode

Use `--verbose` or `-v` to see the LLM's reasoning tokens (extended thinking) displayed in a dimmed block above each response. Useful for understanding how the orchestrator decides which tools to use.

## Architecture

Scrutari is a TypeScript monorepo with four packages:

```
packages/
  core/          Pipeline engine, skill loader, model router, cost tracker,
                 verification system, output formatters (Markdown, JSON, DOCX)

  tools/         Built-in tool implementations (EDGAR, Yahoo Finance, news)
                 with retry logic and rate limiting

  mcp/           MCP client for stdio and HTTP/SSE transports
                 with tool adapter layer

  cli/           Interactive chat interface with Ink TUI, LLM orchestrator,
                 session persistence, and skill discovery.
                 Published to npm as the scrutari binary.
```

The CLI bundles `core`, `tools`, and `mcp` into a single ESM file via tsup. Only runtime npm dependencies (AI SDK, chalk, ink, etc.) are externalized.

## Cost Tracking

Every pipeline run tracks token usage and cost per stage with built-in pricing for common models:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude Opus 4 | $15.00 | $75.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Haiku 3.5 | $0.80 | $4.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |

The default budget cap is $5.00 per pipeline run. If a stage would exceed the budget, the pipeline stops and returns partial results for any completed stages. Cost is displayed inline in the chat during pipeline execution.

## Resilience

- **HTTP retries** — All tool API calls retry on 429 (rate limit) and 5xx errors with exponential backoff and `Retry-After` header support
- **Stale cache fallback** — Market data falls back to cached responses when the API is unavailable
- **Partial results** — If a stage fails, dependent stages are skipped but independent stages continue. The pipeline returns whatever was completed
- **Abort signal** — Ctrl+C aborts the current LLM response; pressing again saves the session and exits
- **MCP timeout** — External tool calls have a 30-second timeout with one automatic retry on transient failures
- **Session auto-save** — Chat sessions are saved every 30 seconds and on exit, so no work is lost

## Requirements

- **Node.js** >= 20
- **API key** from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/api-keys)

## Development

```bash
git clone https://github.com/FoundationalResearch/scrutari.git
cd scrutari
npm install
npx turbo run build

# Run all tests
npx turbo run test

# Run tests for a specific package
cd packages/core && npx vitest run
cd packages/tools && npx vitest run
cd packages/mcp && npx vitest run
cd packages/cli && npx vitest run

# Watch mode
cd packages/core && npx vitest
```

## License

[MIT](./packages/cli/LICENSE)
