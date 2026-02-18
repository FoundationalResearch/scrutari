# scrutari

Deep market analysis CLI powered by LLMs. Run multi-stage research pipelines defined in YAML skill files, with automatic data gathering, analysis, verification, and report generation.

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run analysis (no install needed)
npx @foundationalresearch/scrutari analyze NVDA

# Or install globally
npm install -g @foundationalresearch/scrutari
scrutari analyze AAPL
```

## Features

- **Multi-stage pipelines** — Chain LLM calls with data dependencies, each stage building on previous results
- **Built-in skills** — `deep-dive` (6-stage full analysis), `earnings-review`, `comp-analysis`, `thesis-gen`
- **Custom skills** — Write YAML skill files with your own prompts and stage configurations
- **Multiple providers** — Anthropic Claude and OpenAI GPT models via Vercel AI SDK
- **Built-in tools** — SEC EDGAR filings, Yahoo Finance market data, news aggregation
- **MCP servers** — Extend with external data sources via Model Context Protocol
- **Output formats** — Markdown, JSON, and DOCX with intermediate stage outputs
- **Budget controls** — Per-run USD cost caps with real-time token/cost tracking
- **Resilient** — Automatic retries, exponential backoff, partial results on failures

## Usage

### Analyze a ticker

```bash
# Default deep-dive analysis
scrutari analyze AAPL

# Use a specific skill
scrutari analyze MSFT --skill earnings-review

# Override model and budget
scrutari analyze TSLA --model claude-opus-4-20250514 --budget 10

# Output as DOCX
scrutari analyze NVDA --output docx --output-dir ./reports
```

### Compare tickers

```bash
scrutari compare AAPL MSFT GOOGL
```

### List available skills

```bash
scrutari skills list
```

### Configuration

```bash
# Create config file (~/.scrutari/config.yaml)
scrutari init

# Set config values
scrutari config set defaults.model claude-opus-4-20250514
scrutari config set defaults.max_budget_usd 10

# View current config
scrutari config show
```

## Configuration

Scrutari works with zero configuration when `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is set in your environment. For more options, create a config file:

```bash
scrutari init
```

This creates `~/.scrutari/config.yaml`:

```yaml
providers:
  anthropic:
    api_key: env:ANTHROPIC_API_KEY
    default_model: claude-sonnet-4-20250514
  openai:
    api_key: env:OPENAI_API_KEY
    default_model: gpt-4o

defaults:
  provider: anthropic
  model: claude-sonnet-4-20250514
  max_budget_usd: 5.0
  output_format: markdown
  output_dir: ./output

mcp:
  servers: []

skills_dir: ~/.scrutari/skills
```

## Custom Skills

Create YAML files in `~/.scrutari/skills/` to define custom analysis pipelines:

```yaml
name: my-analysis
version: "1.0"
description: Custom analysis pipeline

inputs:
  - name: ticker
    type: string
    required: true

stages:
  - name: research
    model: claude-sonnet-4-20250514
    prompt: |
      Research {ticker} and provide key findings.
    output_format: markdown

  - name: summarize
    model: claude-haiku-4-5-20251001
    input_from: [research]
    prompt: |
      Summarize the research findings for {ticker}.
    output_format: markdown

output:
  primary: summarize
  format: markdown
```

User skills in `~/.scrutari/skills/` override built-in skills with the same name.

## MCP Servers

Connect external data sources via MCP:

```yaml
mcp:
  servers:
    - name: bloomberg
      command: npx
      args: ["-y", "@bloomberg/mcp-server"]
    - name: custom-api
      url: http://localhost:3001/mcp
```

Reference MCP tools in skill files by server name (e.g., `bloomberg` in the `tools` field).

## Requirements

- Node.js >= 20
- An API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/api-keys)

## License

MIT
