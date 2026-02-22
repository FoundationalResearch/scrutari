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
╭─ scrutari v0.3.0 ─────────────────────────────────────────────╮
│                                                                │
│  Welcome, user!            │ Tips for getting started          │
│                            │ "analyze NVDA" run a deep ...     │
│     ,___,                  │ "what is AAPL at?" get a ...      │
│     (O,O)                  │                                   │
│     /)  )                  │ Recent sessions                   │
│    --"-"--                 │ No recent sessions                │
│                            │                                   │
│  Claude Sonnet 4 · anthropic                                   │
│                                                                │
╰────────────────────────────────────────────────────────────────╯

❯ analyze NVDA
✓ run_pipeline
  ✓ gather 3s  ✓ extract 2s  ✓ analyze 8s  ✓ verify 5s
  ✓ Pipeline complete — $0.17

Here's the analysis for NVIDIA (NVDA)...

❯ what is AAPL trading at?
Apple (AAPL) is currently trading at $189.84, up +1.23 (+0.65%).
```

## How It Works

When you type a message, Scrutari's LLM orchestrator interprets your intent and automatically invokes the right tools:

| You type | Scrutari does |
|----------|--------------|
| "analyze NVDA" | Runs the `deep-dive` pipeline (6 LLM stages with data gathering) |
| "what is AAPL trading at?" | Calls `get_quote` for a real-time stock price |
| "search TSLA SEC filings" | Calls `search_filings` on SEC EDGAR |
| "find news about AI chips" | Calls `search_news` for recent articles |
| "what skills are available?" | Calls `list_skills` to show all pipeline and agent skills |
| "show my config" | Calls `manage_config` to display settings |
| "/activate dcf-valuation" | Activates an agent skill for domain expertise |

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
scrutari skill <subcommand> [args]

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
```

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Ctrl+C** (while processing) | Abort current LLM response |
| **Ctrl+C** (at prompt) | Save session and exit |

## Configuration

When `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` is set in your environment, Scrutari works immediately with sensible defaults (Anthropic, Sonnet 4, $5.00 budget). For full control, create `~/.scrutari/config.yaml`.

Scrutari also supports context engineering: persistent instructions (`~/.scrutari/SCRUTARI.md`, `./SCRUTARI.local.md`), user preferences (`~/.scrutari/preferences.yaml`), analysis rules (`~/.scrutari/rules/`), financial personas (`~/.scrutari/personas/`), and auto-tracked user memory (`~/.scrutari/memory.json`). Use `/activate`, `/persona`, `/instruct`, `/compact`, and `/context` commands in chat.

Scrutari includes 10 built-in **agent skills** (SEC filings, DCF valuation, credit analysis, technical analysis, and more) that provide domain expertise via progressive disclosure. Use `/activate <name>` to load methodology into the system prompt, or let the LLM activate skills automatically based on your questions.

Long sessions are handled automatically: a context usage bar shows token consumption, and auto-compaction triggers at 85% capacity. Use `/compact` to manually compact, or `/compact keep all NVDA metrics` to preserve specific data.

See the [full documentation](https://github.com/FoundationalResearch/scrutari#readme) for configuration details, context engineering, custom skills, MCP servers, and more.

### MarketOnePager

To connect the [MarketOnePager](https://marketonepager.com) MCP server, set your API key:

```bash
export MARKETONEPAGER_KEY=your-api-key
```

Optionally set `MARKETONEPAGER_URL` to override the default server URL (`http://localhost:8001/mcp`). No config file changes needed.

## Hooks

Define lifecycle hooks in `~/.scrutari/hooks.yaml` to run shell commands before/after pipeline stages, tool calls, and session events. Hooks support `{variable}` placeholders, stage/tool filters, timeouts, and background execution. See the [full documentation](https://github.com/FoundationalResearch/scrutari#hooks) for details.

## License

[MIT](./LICENSE)
