# Changelog

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
