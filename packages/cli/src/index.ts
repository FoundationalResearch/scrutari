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
import { ChatApp } from './chat/index.js';
import { listSessions } from './chat/session/storage.js';
import { scanSkillFiles } from '@scrutari/core';

const VERSION = '0.1.0';

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

${chalk.bold('Options:')}
  --continue       Resume the most recent session
  --resume <id>    Resume a specific session by ID
  -c, --config     Path to config file
  -v, --verbose    Show LLM reasoning tokens
  --version        Print version
  --help           Show this help

${chalk.bold('Examples:')}
  ${chalk.dim('$')} scrutari
  ${chalk.dim('$')} scrutari --continue
  ${chalk.dim('$')} scrutari --verbose

${chalk.dim('Inside the chat, just type naturally:')}
  ${chalk.dim('>')} analyze NVDA
  ${chalk.dim('>')} what is AAPL trading at?
  ${chalk.dim('>')} compare MSFT and GOOG
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      continue: { type: 'boolean', default: false },
      resume: { type: 'string' },
      config: { type: 'string', short: 'c' },
      verbose: { type: 'boolean', short: 'v', default: false },
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

    const hasAnyKey = loadedConfig.providers.anthropic.api_key || loadedConfig.providers.openai.api_key;
    if (!hasAnyKey) {
      console.error(chalk.red('No API key found.\n'));
      console.error(chalk.white('Quick start (no config needed):'));
      console.error(chalk.green('  export ANTHROPIC_API_KEY=sk-ant-...\n'));
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

  // Discover available skills
  const builtInDir = getBuiltInSkillsDir();
  const userDir = expandTilde(config.skills_dir);
  const scanned = scanSkillFiles(builtInDir, userDir);
  const skillNames = scanned.map(s => s.name);

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
      skillNames,
      recentSessions,
    }),
  );

  await waitUntilExit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
