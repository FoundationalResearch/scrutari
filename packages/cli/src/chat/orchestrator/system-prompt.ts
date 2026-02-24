import type { SkillSummary, AgentSkillSummary, AgentSkill } from '@scrutari/core';
import type { Config } from '../../config/index.js';
import type { ContextBundle } from '../../context/types.js';

export interface SystemPromptOptions {
  planMode?: boolean;
  readOnly?: boolean;
  contextBundle?: ContextBundle;
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  activeAgentSkill?: AgentSkill;
}

function buildContextSection(bundle: ContextBundle): string {
  const sections: string[] = [];

  // Active Persona
  if (bundle.activePersona) {
    const { persona } = bundle.activePersona;
    let personaSection = `## Active Persona: ${persona.name}\n\n${persona.system_prompt}`;
    if (persona.tone) {
      personaSection += `\n\nTone: ${persona.tone}`;
    }
    sections.push(personaSection);
  }

  // User Preferences
  const { preferences } = bundle;
  const prefLines: string[] = [];
  prefLines.push(`- Analysis depth: ${preferences.analysis_depth}`);
  prefLines.push(`- Risk framing: ${preferences.risk_framing}`);
  if (preferences.favorite_tickers.length > 0) {
    prefLines.push(`- Favorite tickers: ${preferences.favorite_tickers.join(', ')}`);
  }
  if (preferences.favorite_sectors.length > 0) {
    prefLines.push(`- Favorite sectors: ${preferences.favorite_sectors.join(', ')}`);
  }
  const watchlistNames = Object.keys(preferences.watchlists);
  if (watchlistNames.length > 0) {
    for (const name of watchlistNames) {
      prefLines.push(`- Watchlist "${name}": ${preferences.watchlists[name].join(', ')}`);
    }
  }
  if (preferences.output_format) {
    prefLines.push(`- Preferred output format: ${preferences.output_format}`);
  }
  if (preferences.custom_instructions) {
    prefLines.push(`\n${preferences.custom_instructions}`);
  }
  sections.push(`## User Preferences\n\n${prefLines.join('\n')}`);

  // Instructions (SCRUTARI.md files)
  const { instructions } = bundle;
  if (instructions.global) {
    sections.push(`## Global Instructions\n\n${instructions.global}`);
  }
  if (instructions.project) {
    sections.push(`## Project Instructions\n\n${instructions.project}`);
  }
  if (instructions.local) {
    sections.push(`## Local Instructions\n\n${instructions.local}`);
  }
  if (instructions.session) {
    sections.push(`## Session Instructions\n\n${instructions.session}`);
  }

  // Analysis Rules (universal rules only — conditional rules are filtered per-message)
  const universalRules = bundle.rules.filter(r => !r.rule.match);
  if (universalRules.length > 0) {
    const ruleLines = universalRules.map(r => `- **${r.rule.name}**: ${r.rule.instruction}`);
    sections.push(`## Analysis Rules\n\n${ruleLines.join('\n')}`);
  }

  // User History (from persistent memory)
  if (bundle.memory) {
    const memLines: string[] = [];
    const topTickers = bundle.memory.frequent_tickers.slice(0, 5);
    if (topTickers.length > 0) {
      memLines.push('Frequently analyzed tickers:');
      for (const t of topTickers) {
        memLines.push(`  - ${t.ticker} (${t.count} times)`);
      }
    }
    const recentAnalyses = bundle.memory.analysis_history.slice(-5).reverse();
    if (recentAnalyses.length > 0) {
      memLines.push('Recent analyses:');
      for (const a of recentAnalyses) {
        const date = new Date(a.timestamp).toISOString().split('T')[0];
        memLines.push(`  - ${a.skill} on ${a.ticker} (${date})`);
      }
    }
    const depthEntries = Object.entries(bundle.memory.preferred_depth);
    if (depthEntries.length > 0) {
      const topDepth = depthEntries.sort((a, b) => b[1] - a[1])[0];
      memLines.push(`Most used analysis depth: ${topDepth[0]}`);
    }
    const formatEntries = Object.entries(bundle.memory.output_format_history);
    if (formatEntries.length > 0) {
      const topFormat = formatEntries.sort((a, b) => b[1] - a[1])[0];
      memLines.push(`Most used output format: ${topFormat[0]}`);
    }
    if (memLines.length > 0) {
      sections.push(`## User History\n\n${memLines.join('\n')}`);
    }
  }

  return sections.join('\n\n');
}

export function buildSystemPrompt(config: Config, skillNames: string[], mcpTools: { name: string; description: string }[] = [], options: SystemPromptOptions = {}): string {
  let skillList: string;
  if (options.skillSummaries && options.skillSummaries.length > 0) {
    skillList = options.skillSummaries.map(s => `  - **${s.name}** — ${s.description}`).join('\n');
  } else if (skillNames.length > 0) {
    skillList = skillNames.map(s => `  - ${s}`).join('\n');
  } else {
    skillList = '  (none found)';
  }

  const mcpSection = mcpTools.length > 0
    ? `\n## MCP Tools (External)\n\nThe following tools are provided by connected MCP servers and can be called directly:\n${mcpTools.map(t => `  - **${t.name}** — ${t.description}`).join('\n')}\n\nAuthentication and API keys for MCP tools are handled automatically. Do not attempt to provide api_key or authentication parameters — they are injected by the system.\n\nThese tools are also available within pipelines when a skill references the MCP server name in its tools_required/tools_optional.\n`
    : '';

  const agentSkillList = options.agentSkillSummaries && options.agentSkillSummaries.length > 0
    ? options.agentSkillSummaries.map(s => `  - **${s.name}** — ${s.description}`).join('\n')
    : null;

  const activeSkillSection = options.activeAgentSkill
    ? `\n## Active Agent Skill: ${options.activeAgentSkill.frontmatter.name}\n\n${options.activeAgentSkill.body}\n`
    : '';

  // Build tool list dynamically — only include tools whose API keys are configured
  // Direct lookup tools first so the LLM considers them before pipeline tools
  const toolDocs: string[] = [];

  if (config.tools.market_data.api_key) {
    toolDocs.push(`**get_quote** — Get a real-time stock quote. Use for quick price checks (e.g., "what is AAPL trading at?").
   - Requires: ticker (string)`);
  }

  toolDocs.push(`**search_filings** — Search SEC EDGAR for company filings. Use when the user asks about SEC filings, 10-K, 10-Q, etc.
   - Requires: ticker (string), optional: formType (string)`);

  if (config.tools.news.api_key) {
    toolDocs.push(`**search_news** — Search for financial news articles. Use when the user asks about recent news.
   - Requires: query (string)`);
  }

  toolDocs.push(`**run_pipeline** — Run a multi-stage analysis pipeline for in-depth research. Only use when the user asks for comprehensive analysis, comparison, or research — never for simple price checks or data lookups.
   - Requires: skill (string), inputs (object — key-value pairs matching the skill's input schema)
   - Optional: budget (number), model (string — override the model for all stages; omit to use each stage's configured model)
   - Use list_skills to see what inputs each skill requires.
   - Example: run_pipeline({ skill: "deep-dive", inputs: { ticker: "NVDA" } })
   - Example: run_pipeline({ skill: "comp-analysis", inputs: { tickers: ["AAPL", "NVDA", "MSFT"] } })`);

  toolDocs.push(`**list_skills** — List all available analysis skills. Use when the user asks what you can do or what skills are available. Pass detail=true for full info.`);

  toolDocs.push(`**get_skill_detail** — Get detailed info about a specific skill (inputs, stages, tools, cost estimate). Use when the user asks about a particular skill.`);

  toolDocs.push(`**manage_config** — View or update scrutari configuration.
   - action: 'show' to display current config, 'set' to update a value`);

  toolDocs.push(`**list_sessions** — List past chat sessions.`);

  toolDocs.push(`**activate_skill** — Activate an agent skill to load its domain expertise into context. Use when the user asks about a topic matching an agent skill.
   - Requires: name (string)`);

  toolDocs.push(`**read_skill_resource** — Read a reference file from the active agent skill (e.g., guides, glossaries).
    - Requires: path (string, relative to skill directory like "references/guide.md")`);

  toolDocs.push(`**preview_pipeline** — Preview a pipeline execution plan with real cost and time estimates without executing.
    - Same inputs as run_pipeline (skill, inputs, model)
    - Returns: stage list, execution DAG, estimated cost and time per stage and total
    - Use this in plan mode instead of run_pipeline`);

  const toolList = toolDocs.map((doc, i) => `${i + 1}. ${doc}`).join('\n\n');

  // Build conditional allowed-tool lists for plan/read-only mode
  const dataLookupTools: string[] = [];
  if (config.tools.market_data.api_key) dataLookupTools.push('get_quote');
  dataLookupTools.push('search_filings');
  if (config.tools.news.api_key) dataLookupTools.push('search_news');

  return `You are scrutari, an AI-powered financial analysis assistant. You help users analyze stocks, compare companies, and research financial data.

## Available Tools

You have access to the following tools:

${toolList}
${mcpSection}
## Available Pipeline Skills
${skillList}
${agentSkillList ? `\n## Agent Skills\n\nAgent skills provide domain expertise and methodology guidance. Use activate_skill to load one into context.\n${agentSkillList}\n` : ''}
## Configuration
- Provider: ${config.defaults.provider}
- Model: ${config.defaults.model}
- Budget: $${config.defaults.max_budget_usd.toFixed(2)}
${options.contextBundle ? '\n' + buildContextSection(options.contextBundle) + '\n' : ''}
## Guidelines
- For simple data lookups (stock price, quote, filing search, news), ALWAYS use the direct tools (${dataLookupTools.join(', ')}). NEVER use run_pipeline for these.
- Only use run_pipeline when the user explicitly asks for in-depth analysis, research, comparison, deep dive, or thesis generation.
- Default skill is "deep-dive" when the user does ask for analysis.
- If a direct tool is not available (e.g., no API key configured), tell the user rather than falling back to run_pipeline.
- Be concise in responses. Show key findings clearly.
- If a tool fails, explain the error and suggest alternatives.
- When presenting analysis results, format them clearly with headers and bullet points.
- When an agent skill is active, use its methodology and instructions to guide your analysis.
- Use activate_skill when the user's request clearly matches an available agent skill's domain.
${activeSkillSection}${options.planMode ? `
## Plan Mode (ACTIVE)

You are currently in PLAN MODE. You may use read-only tools to gather real data:
- **Allowed**: list_skills, get_skill_detail, ${dataLookupTools.join(', ')}, preview_pipeline
- **Blocked**: run_pipeline (use preview_pipeline instead to get cost/time estimates)

When the user asks for an analysis:
1. Use preview_pipeline to get real cost and time estimates for the skill.
2. Explain the execution plan: stages, models, tools, and execution order.
3. Present the estimated cost and time.
4. Ask if the user wants to proceed. They can type /proceed to execute.
` : ''}${options.readOnly ? `
## Read-Only Mode (ACTIVE)

You are in READ-ONLY mode. Only read-only tools are available:
- ${dataLookupTools.join(', ')} — Data lookups
- list_skills, get_skill_detail, preview_pipeline — Skill information
- list_sessions — Session listing

Pipeline execution (run_pipeline) and config changes are not available.
` : ''}`;
}
