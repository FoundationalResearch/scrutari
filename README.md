<div align="center">

<pre>
   ,___,
   (O,O)
   /)  )
  --"-"--
</pre>

<h1>scrutari</h1>

<p><strong>Interactive financial analysis powered by LLMs</strong></p>

<p>
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#built-in-skills">Skills</a> &middot;
  <a href="#custom-skills">Custom Skills</a> &middot;
  <a href="#configuration">Configuration</a>
</p>

<p>
  <a href="https://www.npmjs.com/package/@foundationalresearch/scrutari"><img src="https://img.shields.io/npm/v/@foundationalresearch/scrutari?label=npm" alt="npm version" /></a>
  <a href="https://github.com/FoundationalResearch/scrutari/actions"><img src="https://img.shields.io/github/actions/workflow/status/FoundationalResearch/scrutari/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/FoundationalResearch/scrutari/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node version" /></a>
</p>

</div>

---

Scrutari is an interactive financial analysis CLI. Type `scrutari` to open a chat where you can ask questions, run analysis pipelines, fetch stock quotes, and search SEC filings — all through natural language. An LLM orchestrator decides which tools to invoke and streams results in real-time.

Under the hood, Scrutari executes multi-stage LLM research pipelines defined as YAML skill files. It handles data gathering from SEC EDGAR and market feeds, multi-model reasoning chains, claim verification, cost tracking, and professional report generation.

## Quick Start

```bash
# Zero config — just set your API key and go
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GEMINI_API_KEY=...
# or
export MINIMAX_API_KEY=...

# Optional: enable market data tools (stock quotes, historical prices, financials)
export RAPIDAPI_KEY=...   # from https://rapidapi.com/apidojo/api/yahoo-finance1

npx @foundationalresearch/scrutari
```

Or install globally:

```bash
npm install -g @foundationalresearch/scrutari
scrutari
```

That's it. No config file needed. Scrutari auto-detects `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `MINIMAX_API_KEY` from your environment and opens an interactive chat.

### Example session

```
╭─ scrutari v0.3.1 ────────────────────────────────────────────────────╮
│                                                                      │
│  Welcome, user!               │ Tips for getting started             │
│                               │ "analyze NVDA" run a deep analysis   │
│     ,___,                     │ "what is AAPL at?" get a stock quote │
│     (O,O)                     │ "search TSLA filings" search EDGAR   │
│     /)  )                     │                                      │
│    --"-"--                    │ Recent sessions                      │
│                               │ No recent sessions                   │
│  Claude Sonnet 4 · anthropic  │                                      │
│  ~/projects                   │                                      │
│                                                                      │
╰──────────────────────────────────────────────────────────────────────╯

❯ analyze NVDA
✓ run_pipeline
  Pipeline: NVDA (deep-dive)
  ✓ gather      3s   $0.02
  ✓ extract     2s   $0.01
  ✓ analyze     8s   $0.06
  ✓ verify      5s   $0.03
  ✓ synthesize  6s   $0.04
  ✓ format      2s   $0.01
  ✓ Pipeline complete — $0.17

Here's the analysis for NVIDIA (NVDA)...

❯ what is AAPL trading at?
Apple (AAPL) is currently trading at $189.84, up +1.23 (+0.65%).

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

Scrutari ships with two types of skills:

- **Pipeline skills** (`*.pipeline.yaml`) — Deterministic multi-stage DAG pipelines that execute a sequence of LLM calls with tools
- **Agent skills** (`SKILL.md`) — Domain expertise that teaches the orchestrator methodology, terminology, and step-by-step analysis frameworks via progressive disclosure

### Pipeline Skills

| Skill | Stages | Description |
|-------|--------|-------------|
| **`deep-dive`** | 6 | Full company analysis: gather SEC filings + market data, extract metrics, analyze financials, verify claims, synthesize narrative, format report |
| **`earnings-review`** | 4 | Quarterly earnings analysis: fetch earnings release + transcript, extract key metrics, analyze beat/miss patterns, produce summary |
| **`comp-analysis`** | 4 | Competitive comparison: gather data for multiple tickers, normalize metrics, head-to-head comparison, ranked report |
| **`thesis-gen`** | 3 | Investment thesis generation: research data gathering, bull/bear case analysis, structured thesis with price targets |
| **`dcf-valuation`** | 4 | DCF valuation: gather financials, build projections, calculate WACC, synthesize valuation with sensitivity analysis |

### Agent Skills

| Skill | Description | References |
|-------|-------------|------------|
| **`sec-filing-analysis`** | Guide for analyzing 10-K, 10-Q, 8-K filings | — |
| **`earnings-call-analysis`** | Earnings transcript analysis methodology | `key-metrics.md` |
| **`dcf-valuation`** | DCF valuation methodology (projections, WACC, terminal value) | `wacc-guide.md` |
| **`comparable-company-analysis`** | Comps analysis with multiples selection | — |
| **`technical-analysis`** | Chart patterns, indicators, trend analysis | `indicator-glossary.md` |
| **`credit-analysis`** | Credit risk assessment, rating methodology | `rating-scales.md` |
| **`macro-environment`** | Macro indicators, interest rates, GDP analysis | — |
| **`esg-screening`** | ESG analysis using standard frameworks | `frameworks.md` |
| **`options-derivatives`** | Options pricing, Greeks, strategy analysis | `greeks-reference.md` |
| **`fixed-income`** | Bond analysis, yield curves, duration | `yield-curve-guide.md` |

Agent skills use **progressive disclosure**: at startup, only names and descriptions are loaded. When activated (via `/activate` or automatically by the LLM), the full methodology is injected into the system prompt. Reference documents are loaded on-demand.

The `dcf-valuation` skill demonstrates **skill composition** — its SKILL.md provides domain expertise while the co-located `dcf-valuation.pipeline.yaml` provides a structured DAG pipeline. When activated, the LLM can use both the methodology guidance and the automated pipeline.

In the chat, just ask naturally:

```
❯ analyze AAPL
❯ run a deep dive on MSFT
❯ generate an investment thesis for TSLA
❯ what skills are available?
❯ /activate dcf-valuation
❯ value NVDA using a DCF model
```

## Built-in Tools

Scrutari ships with data integration tools that the orchestrator and pipeline stages can invoke:

| Tool Group | Tools | Data Source |
|-----------|-------|-------------|
| **edgar** | `edgar_search_filings`, `edgar_get_filing`, `edgar_get_financials` | SEC EDGAR (10-K, 10-Q, 8-K filings, XBRL financials) |
| **market-data** | `market_data_get_quote`, `market_data_get_history`, `market_data_get_financials` | Yahoo Finance via [RapidAPI](https://rapidapi.com/apidojo/api/yahoo-finance1) (price, volume, market cap, historical OHLCV, financial statements). Requires `RAPIDAPI_KEY`. |
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

When `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `MINIMAX_API_KEY` is set in your environment, Scrutari works immediately with sensible defaults:

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
  google:
    api_key: env:GEMINI_API_KEY
    default_model: gemini-2.5-flash
  minimax:
    api_key: env:MINIMAX_API_KEY
    default_model: MiniMax-M2

defaults:
  provider: anthropic                 # anthropic | openai | google | minimax
  model: claude-sonnet-4-20250514
  max_budget_usd: 5.0
  output_format: markdown             # markdown | json | docx
  output_dir: ./output

skills_dir: ~/.scrutari/skills

agents:
  research:
    model: claude-sonnet-4-20250514    # per-agent model override
  explore:
    model: claude-haiku-3-5-20241022
  verify:
    model: claude-sonnet-4-20250514
  default:
    model: claude-sonnet-4-20250514

compaction:
  enabled: true                        # auto-compact when context fills up
  auto_threshold: 0.85                 # trigger at 85% of context window
  preserve_turns: 4                    # keep last 4 turns (8 messages) verbatim
  model: claude-haiku-3-5-20241022     # cheap model for summarization

tools:
  market_data:
    api_key: env:RAPIDAPI_KEY          # RapidAPI key for Yahoo Finance market data

mcp:
  servers: []
```

API keys support multiple formats: `env:VAR_NAME`, `$VAR_NAME`, `${VAR_NAME}`, or literal strings.

You can also manage config from within the chat:

```
❯ show my config
❯ set the budget to $10
```

## Hooks

Scrutari supports lifecycle hooks — shell commands that run automatically before or after pipeline stages, tool calls, and session events. Define hooks in `~/.scrutari/hooks.yaml`:

```yaml
hooks:
  post_pipeline:
    - command: "cp {output_path} ~/reports/"
      description: "Auto-save report"
    - command: "curl -X POST https://slack.webhook/... -d '{summary}'"
      description: "Post to Slack"
      background: true
  post_stage:
    - stage: gather
      command: "echo 'Gathered: {tokens} tokens, ${cost}'"
  session_start:
    - command: "cat ~/.portfolio/positions.csv"
```

### Available Events

| Event | When | Blocking? |
|-------|------|-----------|
| `pre_pipeline` | Before first stage runs | Yes (failure aborts pipeline) |
| `post_pipeline` | After pipeline completes | No |
| `pre_stage` | Before each stage executes | Yes |
| `post_stage` | After each stage completes | No |
| `pre_tool` | Before each tool call | Yes |
| `post_tool` | After each tool call | No |
| `session_start` | After session is initialized | No |
| `session_end` | Before session exits | No |

### Hook Options

- **`command`** (required) — Shell command to execute. Use `{variable}` placeholders for context values (e.g., `{skill_name}`, `{stage_name}`, `{cost}`, `{summary}`).
- **`description`** — Human-readable description (for your reference).
- **`stage`** — Filter: only run for this stage name (for `pre_stage`/`post_stage` hooks).
- **`tool`** — Filter: only run for this tool name (for `pre_tool`/`post_tool` hooks).
- **`timeout_ms`** — Timeout in milliseconds (default: 30000).
- **`background: true`** — Fire-and-forget: don't wait for the command to finish.

Blocking hooks (`pre_*`) abort the operation if the command exits with a non-zero code or times out. Non-blocking hooks (`post_*`, `session_*`) log errors but never interrupt execution.

## Context Engineering

Scrutari supports persistent context that shapes how the LLM analyzes and responds. Context is loaded automatically at startup and can be modified during a session.

### SCRUTARI.md — Instruction Files

Create free-form markdown files to inject persistent instructions:

| File | Scope |
|------|-------|
| `~/.scrutari/SCRUTARI.md` | Global — loaded in every session |
| `./SCRUTARI.md` or `.scrutari/SCRUTARI.md` | Project — loaded when running from that directory |
| `./SCRUTARI.local.md` | Local overrides — per directory, gitignored |

Instructions are injected into the system prompt in order: global, project, local. Use them for analysis style preferences, domain-specific guidance, or recurring requirements. The local file is intended for personal overrides that shouldn't be committed to version control.

### Preferences

Create `~/.scrutari/preferences.yaml` to set structured preferences:

```yaml
analysis_depth: deep          # quick | standard | deep | exhaustive
risk_framing: conservative    # conservative | moderate | aggressive
favorite_tickers: [AAPL, NVDA, MSFT]
favorite_sectors: [technology, healthcare]
watchlists:
  mega-cap: [AAPL, MSFT, GOOG, AMZN]
  energy: [XOM, CVX, COP]
output_format: markdown       # markdown | json | docx
default_persona: equity-analyst
custom_instructions: "Always include ESG analysis in reports"
```

### Analysis Rules

Create YAML files in `~/.scrutari/rules/` (global) or `.scrutari/rules/` (project):

```yaml
name: always-cite-sources
instruction: Always cite specific SEC filing dates and numbers when referencing financial data
priority: 80
```

Rules can be conditional with glob-pattern matching:

```yaml
name: tech-deep-dive
match:
  sector: "tech*"
instruction: Include TAM analysis and competitive moat assessment
priority: 60
```

Project rules override global rules with the same name.

### Personas

Switch between predefined analysis styles. Built-in personas:

| Persona | Description |
|---------|-------------|
| `equity-analyst` | Deep fundamental analysis, DCF-focused, long-form reports |
| `pm-brief` | Portfolio manager style, concise, risk-focused, relative value |
| `quant-screen` | Data-heavy, metrics-first, minimal narrative |
| `thesis-builder` | Bull/bear framework, catalyst-focused, price targets |

Create custom personas in `~/.scrutari/personas/*.yaml`:

```yaml
name: quant-analyst
description: Quantitative analysis focused on statistical patterns
system_prompt: >
  You are a quantitative analyst. Focus on statistical patterns,
  factor exposures, and systematic signals. Use numbers, not narratives.
analysis_depth: deep
risk_framing: moderate
tone: precise and data-heavy
```

### User Memory

Scrutari automatically tracks your usage across sessions in `~/.scrutari/memory.json`:

- **Frequent tickers** — tickers you mention are counted and surfaced to the LLM
- **Analysis history** — recent skill runs (skill + ticker + date)
- **Preferred depth** — tracks which analysis depth you use most
- **Output format history** — tracks which output format you prefer

This data is injected into the system prompt so the LLM can personalize responses (e.g., defaulting to your most-analyzed tickers). The memory file is updated automatically after each interaction.

### Chat Commands

| Command | Description |
|---------|-------------|
| `/activate <name>` | Activate an agent skill for domain expertise (e.g., `/activate dcf-valuation`) |
| `/compact [text]` | Compact context window. Optional: instructions to preserve specific data |
| `/persona [name]` | Switch persona or show current. `/persona off` to deactivate |
| `/instruct <text>` | Set session-level instructions. `/instruct clear` to remove |
| `/context` | Show active context summary |
| `/plan` | Toggle plan mode (outline steps before executing) |
| `/dry-run` | Toggle dry-run mode (estimate costs without executing) |
| `/read-only` | Toggle read-only mode (only data lookups, no writes) |
| `/skills` | Browse available skills interactively |
| `/tools` | Show configured tools and MCP servers |
| `/mcp` | Show MCP server connection status |
| `/help` | Show available commands |
| `/<skill> [args]` | Run a skill directly (e.g., `/deep-dive NVDA`) |

## Custom Skills

### Pipeline Skills

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
| `agent_type` | string | Agent execution profile: `research`, `explore`, `verify`, or `default` |

### Agent Skills

Create a directory in `~/.scrutari/skills/` with a `SKILL.md` file to teach the orchestrator domain expertise:

```
~/.scrutari/skills/my-analysis/
  SKILL.md              # Required: frontmatter + methodology
  references/           # Optional: supporting documents
    glossary.md
    checklist.md
```

The `SKILL.md` file uses YAML frontmatter followed by a Markdown body:

```markdown
---
name: my-analysis
description: Custom analysis methodology for my domain
metadata:
  author: your-name
  version: "1.0"
---

# My Analysis Methodology

## When to Use This Skill

- User asks about [your domain]
- User mentions [relevant keywords]

## Methodology

### Step 1: ...

[Your step-by-step instructions here]
```

**Frontmatter fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill identifier (lowercase, hyphens, 1-64 chars) |
| `description` | string | Yes | Human-readable description (1-1024 chars) |
| `license` | string | No | License identifier |
| `compatibility` | string | No | Compatibility notes |
| `metadata` | object | No | Key-value pairs (author, version, etc.) |
| `allowed-tools` | string | No | Tools the skill can use |

Agent skills follow the [Agent Skills Standard](https://agentskills.io/specification). You can install community skills directly:

```bash
scrutari skill install user/repo/skill-name
scrutari skill install https://example.com/my-skill/SKILL.md
```

Validate your skills before sharing:

```bash
scrutari skill validate ~/.scrutari/skills/my-analysis/
```

## MCP Servers

Extend Scrutari with external data sources via the [Model Context Protocol](https://modelcontextprotocol.io/):

### Adding Servers via CLI

```bash
# Stdio transport (local process)
scrutari mcp add my-server -- npx -y @some/mcp-server

# HTTP transport (remote server)
scrutari mcp add --transport http my-api http://localhost:3001/mcp

# With environment variables for the server process
scrutari mcp add --env API_KEY=xxx my-server -- node server.js

# With auth headers for HTTP
scrutari mcp add --transport http --header "Authorization: Bearer tok" my-api http://api.example.com/mcp

# From a JSON blob
scrutari mcp add-json bloomberg '{"command":"npx","args":["-y","@bloomberg/mcp-server"]}'

# List, inspect, remove
scrutari mcp list
scrutari mcp get my-server
scrutari mcp remove my-server
```

### Manual Configuration

You can also edit `~/.scrutari/config.yaml` directly:

```yaml
mcp:
  servers:
    - name: bloomberg
      command: npx
      args: ["-y", "@bloomberg/mcp-server"]

    - name: custom-data
      url: http://localhost:3001/mcp
      headers:
        Authorization: Bearer your-token

    - name: market-api
      url: http://localhost:8001/mcp
      headers:
        X-API-Key: your-api-key
      injectedParams:          # auto-injected into every tool call (hidden from the LLM)
        api_key: your-api-key
```

MCP tools are automatically registered and can be referenced in skill `tools` fields by server name. Servers support both **stdio** (local process) and **HTTP/SSE** (remote) transports with automatic timeout (30s) and retry on transient failures. Use `injectedParams` to auto-inject parameters (like API keys) into every tool call — they are stripped from the schema so the LLM never sees them.

### MarketOnePager

Scrutari auto-configures the [MarketOnePager](https://marketonepager.com) MCP server when the `MARKETONEPAGER_KEY` environment variable is set:

```bash
export MARKETONEPAGER_KEY=your-api-key
```

Optionally, set a custom server URL (defaults to `http://localhost:8001/mcp`):

```bash
export MARKETONEPAGER_URL=https://your-server.com/mcp
```

No config file changes needed — Scrutari will automatically connect to the MarketOnePager server and register its tools for use in chat and pipelines.

## CLI Reference

```
scrutari [options]
scrutari skill <subcommand> [args]
scrutari mcp <subcommand> [args]

Options:
  --continue          Resume the most recent session
  --resume <id>       Resume a specific session by ID
  -c, --config        Path to config file
  -v, --verbose       Show LLM reasoning tokens
  --dry-run           Estimate pipeline costs without executing
  --read-only         Only allow read-only tools (quotes, filings, news)
  --persona <name>    Start with a specific persona active
  --version           Print version
  --help              Show help

Subcommands:
  skill list          List all available skills (pipeline + agent)
  skill create        Interactive skill creation wizard
  skill validate      Validate a skill YAML file or agent skill directory
  skill install       Install a skill from a URL or GitHub shorthand
  mcp add             Add an MCP server (stdio or HTTP)
  mcp add-json        Add an MCP server from a JSON blob
  mcp list            List configured MCP servers
  mcp get             Show details for a specific server
  mcp remove          Remove an MCP server

Examples:
  scrutari                              Open interactive chat
  scrutari --continue                   Resume last session
  scrutari --verbose                    Show LLM thinking tokens
  scrutari --persona equity-analyst     Start with equity-analyst persona
  scrutari skill list                   List all skills
  scrutari skill install user/repo/my-skill
  scrutari mcp add my-server -- npx -y @some/mcp
  scrutari mcp list
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

## Multi-Agent Pipeline Execution

Pipeline stages are classified into agent types with distinct execution profiles:

| Agent Type | Default Model | Max Tokens | Temperature | Use Case |
|------------|---------------|------------|-------------|----------|
| `research` | Claude Sonnet 4 | 8192 | 0.1 | Data gathering with tools + structured output |
| `explore` | Claude Haiku 3.5 | 2048 | 0 | Lightweight tool-based data collection |
| `verify` | Claude Sonnet 4 | 4096 | 0.1 | Claim verification stages |
| `default` | Claude Sonnet 4 | 4096 | 0.3 | General analysis and synthesis |

Agent types are assigned automatically based on stage properties (tool usage, output format, dependencies, name), or explicitly via `agent_type` in the skill YAML.

**Parallel execution:** Independent stages (no shared dependencies) run concurrently within a configurable concurrency limit (default: 5). For example, a skill with two independent `gather` stages will run both simultaneously, then proceed to downstream stages once both complete.

**Model routing priority:** `modelOverride` (global) > `stage.model` (YAML) > `agents.{type}.model` (config) > agent type default.

Override agent defaults per-type in `~/.scrutari/config.yaml`:

```yaml
agents:
  explore:
    model: gpt-4o-mini
    temperature: 0.1
  research:
    model: claude-sonnet-4-20250514
    max_tokens: 16384
```

## Cost Tracking

Every pipeline run tracks token usage and cost per stage with built-in pricing for common models:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude Opus 4 | $15.00 | $75.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Haiku 3.5 | $0.80 | $4.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |
| Gemini 2.5 Pro | $1.25 | $10.00 |
| Gemini 2.5 Flash | $0.15 | $0.60 |
| Gemini 2.0 Flash | $0.10 | $0.40 |
| MiniMax M2 | $1.10 | $4.40 |
| MiniMax M2 Stable | $1.10 | $4.40 |

The default budget cap is $5.00 per pipeline run. If a stage would exceed the budget, the pipeline stops and returns partial results for any completed stages. Cost is displayed inline in the chat during pipeline execution.

## Resilience

- **HTTP retries** — All tool API calls retry on 429 (rate limit) and 5xx errors with exponential backoff and `Retry-After` header support
- **Stale cache fallback** — Market data falls back to cached responses when the API is unavailable
- **Parallel execution** — Independent pipeline stages run concurrently with a semaphore-based concurrency cap, with budget reservations preventing parallel agents from double-spending
- **Partial results** — If a stage fails, dependent stages are skipped but independent stages continue. The pipeline returns whatever was completed
- **Abort signal** — Ctrl+C aborts the current LLM response; pressing again saves the session and exits
- **MCP timeout** — External tool calls have a 30-second timeout with one automatic retry on transient failures
- **Session auto-save** — Chat sessions are saved every 30 seconds and on exit, so no work is lost

## Requirements

- **Node.js** >= 20
- **API key** from [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey), or [MiniMax](https://www.minimax.io/)

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

[MIT](./LICENSE)
