# Changelog

## 0.2.0 (2026-02-21)

### Features

- **Google Gemini provider** — Added Gemini 2.5 Pro/Flash as a third LLM provider
- **MiniMax provider** — Added MiniMax M2 and M2 Stable model support
- **Agent skills** — 10 built-in domain expertise skills (SEC filings, DCF valuation, credit analysis, technical analysis, and more) with progressive disclosure
- **MCP server integration** — Full stdio and HTTP/SSE transport support for external tool servers
- **Context engineering** — Persistent instructions (`SCRUTARI.md`), preferences, analysis rules, personas, and auto-tracked user memory
- **Chat commands** — `/plan`, `/dry-run`, `/read-only`, `/skills`, `/help`, `/activate`, `/compact`, `/persona`, `/instruct`, `/context`
- **`--read-only` flag** — Restrict to read-only tools (quotes, filings, news)
- **Compaction** — Automatic context compaction at configurable threshold with manual `/compact` command
- **Permissions system** — Per-tool permission levels (`auto`, `confirm`, `deny`) in config
- **DCF valuation pipeline** — New `dcf-valuation` pipeline skill with WACC and sensitivity analysis
- **Session budget** — Configurable per-session budget cap (`session_budget_usd`)

### Fixes

- Removed hardcoded MCP server from default config

## 0.1.0 (2025-06-01)

Initial release.

### Features

- **Multi-stage analysis pipeline** — Run LLM-powered analysis pipelines defined in YAML skill files
- **Built-in skills** — `deep-dive`, `earnings-review`, `comp-analysis`, `thesis-gen`
- **Custom skills** — Create your own YAML skill files in `~/.scrutari/skills/`
- **Multiple providers** — Anthropic (Claude) and OpenAI (GPT) via AI SDK
- **Output formats** — Markdown, JSON, and DOCX output with intermediate stage results
- **Budget controls** — Per-run USD cost caps with real-time token tracking
- **MCP integration** — Connect external tool servers via Model Context Protocol
- **Interactive TUI** — Real-time progress display with Ink (falls back to headless mode)
- **Zero-config start** — Works with just `ANTHROPIC_API_KEY` environment variable
- **Resilient execution** — Automatic retries with exponential backoff, partial results on failures
- **Verification stage** — Optional claim verification with source citations
