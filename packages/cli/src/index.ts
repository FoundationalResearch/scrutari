#!/usr/bin/env node

import { parseArgs } from 'node:util';
import React from 'react';
import { render } from 'ink';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { loadConfigWithMeta, ConfigError } from './config/index.js';
import { setConfig } from './context.js';
import { resolveContext } from './context/index.js';
import { ChatApp } from './chat/index.js';
import { listSessions } from './chat/session/storage.js';
import { scanSkillFiles, scanSkillSummaries, scanAgentSkillSummaries, HookManager } from '@scrutari/core';
import { MCPClientManager } from '@scrutari/mcp';

const VERSION = '0.3.1';

function getBuiltInSkillsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  const bundledPath = resolve(thisDir, '..', 'skills');
  if (existsSync(bundledPath)) return bundledPath;
  const tscPath = resolve(thisDir, '..', '..', '..', '..', 'skills');
  if (existsSync(tscPath)) return tscPath;
  // dev: try relative to packages/cli/
  const devPath = resolve(thisDir, '..', '..', 'skills');
  return devPath;
}

function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function printHelp(): void {
  console.log(`
${chalk.blue.bold('scrutari')} — Interactive financial analysis chat

${chalk.bold('Usage:')}
  scrutari [options]
  scrutari skill <subcommand> [args]
  scrutari mcp <subcommand> [args]

${chalk.bold('Options:')}
  --continue       Resume the most recent session
  --resume <id>    Resume a specific session by ID
  -c, --config     Path to config file
  -v, --verbose    Show LLM reasoning tokens
  --dry-run        Estimate pipeline costs without executing
  --read-only      Only allow read-only tools (quotes, filings, news)
  --persona <name> Start with a specific persona active
  --version        Print version
  --help           Show this help

${chalk.bold('Subcommands:')}
  skill list       List all available skills with descriptions
  skill create     Interactive skill creation wizard
  skill validate   Validate a skill YAML file or agent skill directory
  skill install    Install a skill from a URL or GitHub shorthand
  mcp add          Add an MCP server (stdio or HTTP)
  mcp add-json     Add an MCP server from a JSON blob
  mcp list         List configured MCP servers
  mcp get          Show details for a specific server
  mcp remove       Remove an MCP server

${chalk.bold('Chat Commands:')}
  /plan            Toggle plan mode (preview execution without running)
  /dry-run         Toggle dry-run mode (estimate costs only)
  /read-only       Toggle read-only mode (only data lookups)
  /compact [text]  Compact context window (optional: instructions to preserve)
  /tools           Show configured tools and MCP servers
  /mcp             Show MCP server connection status
  /skills          Browse skills interactively
  /activate <name> Activate an agent skill for domain expertise
  /persona [name]  Switch persona (or show current). Use "off" to deactivate
  /instruct <text> Set session-level instructions. Use "clear" to remove
  /context         Show active context (persona, preferences, rules)
  /help            Show available commands
  /<skill> [args]  Run a skill directly (e.g., /deepdive NVDA --depth full)

${chalk.bold('Context Files:')}
  ~/.scrutari/SCRUTARI.md          Global instructions (always loaded)
  ./SCRUTARI.md                    Project instructions (per directory)
  ./SCRUTARI.local.md              Local overrides (gitignored, per directory)
  ~/.scrutari/preferences.yaml     User preferences (tickers, depth, persona)
  ~/.scrutari/rules/*.yaml         Analysis rules with pattern matching
  ~/.scrutari/personas/*.yaml      Custom personas
  ~/.scrutari/hooks.yaml             Lifecycle hooks (shell commands)
  ~/.scrutari/memory.json          Auto-tracked user history

${chalk.bold('Examples:')}
  ${chalk.dim('$')} scrutari
  ${chalk.dim('$')} scrutari --continue
  ${chalk.dim('$')} scrutari --verbose
  ${chalk.dim('$')} scrutari skill list
  ${chalk.dim('$')} scrutari skill install user/repo/my-skill
  ${chalk.dim('$')} scrutari mcp add my-server -- npx -y @some/mcp-server
  ${chalk.dim('$')} scrutari mcp add --transport http my-api http://localhost:3001/mcp
  ${chalk.dim('$')} scrutari mcp list

${chalk.dim('Inside the chat, just type naturally:')}
  ${chalk.dim('>')} analyze NVDA
  ${chalk.dim('>')} what is AAPL trading at?
  ${chalk.dim('>')} /deepdive NVDA --depth full
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      continue: { type: 'boolean', default: false },
      resume: { type: 'string' },
      config: { type: 'string', short: 'c' },
      verbose: { type: 'boolean', short: 'v', default: false },
      'dry-run': { type: 'boolean', default: false },
      'read-only': { type: 'boolean', default: false },
      persona: { type: 'string' },
      version: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.version) {
    console.log(VERSION);
    return;
  }

  if (values.help) {
    printHelp();
    return;
  }

  // Subcommand routing: scrutari skill <subcommand> [args]
  if (positionals.length > 0 && positionals[0] === 'skill') {
    const { handleSkillCommand } = await import('./skill/index.js');
    await handleSkillCommand(positionals[1] ?? 'list', positionals.slice(2));
    return;
  }

  // Subcommand routing: scrutari mcp <subcommand> [args]
  if (positionals.length > 0 && positionals[0] === 'mcp') {
    const { handleMcpCommand } = await import('./mcp/index.js');
    await handleMcpCommand(positionals[1] ?? 'list', positionals.slice(2), process.argv);
    return;
  }

  // Load config
  let config;
  try {
    const { config: loadedConfig, configFileExists, envKeysUsed } = loadConfigWithMeta({
      configPath: values.config as string | undefined,
    });

    if (!configFileExists && envKeysUsed.length > 0) {
      console.error(chalk.blue(`  Using ${envKeysUsed.join(', ')} from environment.`));
      console.error(chalk.dim(`  Run "scrutari init" to create a config file for more options.\n`));
    }

    const hasAnyKey = loadedConfig.providers.anthropic.api_key || loadedConfig.providers.openai.api_key || loadedConfig.providers.google.api_key || loadedConfig.providers.minimax.api_key;
    if (!hasAnyKey) {
      console.error(chalk.red('No API key found.\n'));
      console.error(chalk.white('Quick start (no config needed):'));
      console.error(chalk.green('  export ANTHROPIC_API_KEY=sk-ant-...'));
      console.error(chalk.green('  export OPENAI_API_KEY=sk-...'));
      console.error(chalk.green('  export GEMINI_API_KEY=...'));
      console.error(chalk.green('  export MINIMAX_API_KEY=...\n'));
      console.error(chalk.white('Or create a config file:'));
      console.error(chalk.green('  scrutari init\n'));
      console.error(chalk.dim('Get an API key at: https://console.anthropic.com/'));
      process.exit(1);
    }

    config = loadedConfig;
    setConfig(config);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(chalk.red(`Config error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  // Initialize hook manager
  const hookManager = new HookManager({
    onHookOutput: (_event, result) => {
      if (result.stderr) console.error(chalk.yellow(`  Hook: ${result.stderr.trim()}`));
    },
    onHookError: (event, error) => {
      console.error(chalk.yellow(`  Hook [${event}] failed: ${error.message}`));
    },
  });
  try {
    hookManager.load();
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.yellow(`  Warning: Failed to load hooks: ${error.message}`));
    }
  }

  // Discover available skills
  const builtInDir = getBuiltInSkillsDir();
  const userDir = expandTilde(config.skills_dir);
  const scanned = scanSkillFiles(builtInDir, userDir);
  const skillNames = scanned.map(s => s.name);
  const skillSummaries = scanSkillSummaries(builtInDir, userDir);
  const agentSkillSummaries = scanAgentSkillSummaries(builtInDir, userDir);

  // Auto-configure MarketOnePager MCP server when api_key is available (from config or env)
  const marketonepagerKey = config.tools.marketonepager.api_key;
  if (marketonepagerKey) {
    const marketonepagerUrl = config.tools.marketonepager.url ?? 'http://localhost:8001/mcp';
    const alreadyConfigured = config.mcp.servers.some(s => s.name === 'marketonepager');
    if (!alreadyConfigured) {
      config.mcp.servers.push({
        name: 'marketonepager',
        url: marketonepagerUrl,
        headers: { 'X-API-Key': marketonepagerKey },
        injectedParams: { api_key: marketonepagerKey },
      });
    }
  }

  // Initialize MCP servers (if configured)
  let mcpClient: MCPClientManager | undefined;
  if (config.mcp.servers.length > 0) {
    mcpClient = new MCPClientManager();
    await mcpClient.initialize(config.mcp.servers, (serverName, error) => {
      console.error(chalk.yellow(`  MCP server "${serverName}" failed to connect: ${error.message}`));
    });
    if (mcpClient.size > 0) {
      const infos = mcpClient.getServerInfos();
      const toolCount = infos.reduce((sum, s) => sum + s.tools.length, 0);
      console.error(chalk.blue(`  MCP: ${mcpClient.size} server(s) connected, ${toolCount} tool(s) available.`));
    }
  }

  // Load context (instructions, preferences, rules, personas)
  const contextBundle = resolveContext({ cwd: process.cwd(), personaOverride: values.persona as string | undefined });
  if (contextBundle.activePersona) {
    console.error(chalk.blue(`  Persona: ${contextBundle.activePersona.persona.name}`));
  }

  // Load recent sessions for welcome banner
  const recentSessions = listSessions();

  // Render the chat app
  const { waitUntilExit } = render(
    React.createElement(ChatApp, {
      config,
      version: VERSION,
      cwd: process.cwd(),
      continueSession: values.continue as boolean,
      resumeId: values.resume as string | undefined,
      verbose: values.verbose as boolean,
      dryRun: values['dry-run'] as boolean,
      readOnly: values['read-only'] as boolean,
      skillNames,
      skillSummaries,
      agentSkillSummaries,
      recentSessions,
      mcpClient,
      contextBundle,
      hookManager,
    }),
  );

  await waitUntilExit();

  // Clean up MCP connections on exit
  if (mcpClient) {
    await mcpClient.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
