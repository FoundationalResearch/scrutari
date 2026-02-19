<p align="center">
  <h1 align="center">scrutari</h1>
  <p align="center">
    Multi-stage financial analysis pipelines powered by LLMs
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

Scrutari orchestrates multi-stage LLM research pipelines for deep financial analysis. Define analysis workflows as YAML skill files, and Scrutari handles data gathering from SEC EDGAR and market feeds, multi-model reasoning chains, claim verification, cost tracking, and professional report generation.

## Quick Start

```bash
# Zero config — just set your API key and go
export ANTHROPIC_API_KEY=sk-ant-...
npx @foundationalresearch/scrutari analyze NVDA
```

Or install globally:

```bash
npm install -g @foundationalresearch/scrutari
scrutari analyze AAPL
```

That's it. No config file needed. Scrutari auto-detects `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from your environment.

## How It Works

Scrutari executes analysis as a **directed acyclic graph (DAG) of LLM stages**, where each stage can:

- Call external tools (SEC EDGAR, Yahoo Finance, news APIs)
- Use different models and temperatures tuned to the task
- Consume outputs from upstream stages via `input_from` dependencies
- Stream results in real-time to the terminal

```
gather ──> extract ──> analyze ──> verify ──> synthesize ──> format
  │                       │           │            │
  │ Haiku + tools         │ Sonnet    │ Sonnet     │ Haiku
  │ (fast data fetch)     │ (reason)  │ (verify)   │ (format)
```

The pipeline engine resolves the DAG topologically, tracks token usage and cost per stage, enforces budget limits, and produces partial results if a stage fails so downstream work isn't lost.

## Built-in Skills

| Skill | Stages | Description |
|-------|--------|-------------|
| **`deep-dive`** | 6 | Full company analysis: gather SEC filings + market data, extract metrics, analyze financials, verify claims, synthesize narrative, format report |
| **`earnings-review`** | 4 | Quarterly earnings analysis: fetch earnings release + transcript, extract key metrics, analyze beat/miss patterns, produce summary |
| **`comp-analysis`** | 4 | Competitive comparison: gather data for multiple tickers, normalize metrics, head-to-head comparison, ranked report |
| **`thesis-gen`** | 3 | Investment thesis generation: research data gathering, bull/bear case analysis, structured thesis with price targets |

```bash
# Deep-dive (default)
scrutari analyze AAPL

# Earnings review
scrutari analyze MSFT --skill earnings-review

# Investment thesis with bearish starting perspective
scrutari analyze TSLA --skill thesis-gen

# Compare competitors
scrutari compare AAPL MSFT GOOGL
```

## Built-in Tools

Scrutari ships with data integration tools that stages can invoke during execution:

| Tool Group | Tools | Data Source |
|-----------|-------|-------------|
| **edgar** | `edgar_search_filings`, `edgar_get_filing`, `edgar_get_financials` | SEC EDGAR (10-K, 10-Q, 8-K filings, XBRL financials) |
| **market-data** | `market_data_get_quote`, `market_data_get_history`, `market_data_get_financials` | Yahoo Finance (price, volume, market cap, historical OHLCV, financial statements) |
| **news** | `news_search` | Brave Search (recent news with configurable lookback window) |

Tools handle rate limiting, retries with exponential backoff, and stale cache fallback automatically.

## Output Formats

```bash
# Markdown (default)
scrutari analyze NVDA

# JSON (machine-readable)
scrutari analyze NVDA --output json

# Word document
scrutari analyze NVDA --output docx --output-dir ./reports

# JSON mode for scripting (pipeline metadata + primary output)
scrutari analyze NVDA --json
```

**Markdown** output includes YAML frontmatter, inline verification badges (verified/disputed/unverified), footnoted citations, and a per-stage execution metadata table.

**DOCX** output produces a professionally formatted Word document with a cover page, table of contents, structured sections, verification summary tables, and branded headers/footers.

Both formats include a **verification section** when the skill includes a `verify` stage — claims from the analysis are extracted, cross-referenced, and annotated with confidence scores and source citations.

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

For full control, create a config file:

```bash
scrutari init
```

This creates `~/.scrutari/config.yaml`:

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

```bash
# Set individual values
scrutari config set defaults.model claude-opus-4-20250514
scrutari config set defaults.max_budget_usd 10

# View current config
scrutari config show
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

```bash
scrutari analyze NVDA --skill sector-overview
```

User skills override built-in skills with the same name. Run `scrutari skills list` to see all available skills.

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

```bash
# List connected MCP servers and their tools
scrutari mcp list
```

## CLI Reference

```
scrutari [options] [command]

Options:
  -V, --version                output version
  -v, --verbose                verbose output
  --json                       machine-readable JSON output
  --no-tui                     force headless mode
  -c, --config <path>          path to config file

Commands:
  analyze <ticker>             run analysis pipeline
    -s, --skill <name>         skill to use (default: deep-dive)
    -m, --model <model>        override model
    -o, --output <format>      output format (markdown|json|docx)
    --output-dir <dir>         output directory
    --deep                     use deep-dive skill
    --budget <usd>             budget cap in USD

  compare <tickers...>         compare multiple tickers
    -s, --skill <name>         skill to use (default: comp-analysis)

  skills list                  list available skills
  skills show <name>           show skill details
  skills create <name>         create skill from template

  config init                  create config file
  config show                  display current config
  config set <key> <value>     set a config value

  mcp list                     list MCP servers and tools
```

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

  cli/           Commander-based CLI with Ink TUI, config management,
                 and skill discovery. Published to npm as the scrutari binary.
```

The CLI bundles `core`, `tools`, and `mcp` into a single ESM file via tsup. Only runtime npm dependencies (AI SDK, chalk, commander, etc.) are externalized.

## Cost Tracking

Every pipeline run tracks token usage and cost per stage with built-in pricing for common models:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude Opus 4 | $15.00 | $75.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Haiku 3.5 | $0.80 | $4.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |

The `--budget` flag (default: $5.00) sets a hard cap. If a stage would exceed the budget, the pipeline stops and returns partial results for any completed stages.

## Resilience

- **HTTP retries** — All tool API calls retry on 429 (rate limit) and 5xx errors with exponential backoff and `Retry-After` header support
- **Stale cache fallback** — Market data falls back to cached responses when the API is unavailable
- **Partial results** — If a stage fails, dependent stages are skipped but independent stages continue. The pipeline returns whatever was completed
- **Abort signal** — Ctrl+C triggers graceful shutdown, returning partial results
- **MCP timeout** — External tool calls have a 30-second timeout with one automatic retry on transient failures

## Requirements

- **Node.js** >= 20
- **API key** from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/api-keys)

## Development

```bash
git clone https://github.com/FoundationalResearch/scrutari.git
cd scrutari
npm install
npx turbo run build

# Run all tests (430 tests across 4 packages)
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
