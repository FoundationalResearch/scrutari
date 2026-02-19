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
  <a href="https://github.com/FoundationalResearch/scrutari/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@foundationalresearch/scrutari" alt="License" /></a>
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

## Sessions

Scrutari automatically saves your chat history:

```bash
scrutari --continue          # Resume the most recent session
scrutari --resume <id>       # Resume a specific session
```

Sessions are stored as JSON files in `~/.scrutari/sessions/`.

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
```

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Ctrl+C** (while processing) | Abort current LLM response |
| **Ctrl+C** (at prompt) | Save session and exit |

## Configuration

When `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your environment, Scrutari works immediately with sensible defaults (Anthropic, Sonnet 4, $5.00 budget). For full control, create `~/.scrutari/config.yaml`.

See the [full documentation](https://github.com/FoundationalResearch/scrutari#readme) for configuration details, custom skills, MCP servers, and more.

## License

[MIT](./LICENSE)
