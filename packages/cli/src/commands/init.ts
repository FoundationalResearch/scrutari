import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';

export interface InitCommandOptions {
  configPath?: string;
  homeDir?: string;
  logger?: (...args: unknown[]) => void;
}

function expandTilde(pathValue: string, homeDirectory: string): string {
  if (pathValue === '~') {
    return homeDirectory;
  }
  if (pathValue.startsWith('~/')) {
    return resolve(homeDirectory, pathValue.slice(2));
  }
  return pathValue;
}

function resolveConfigPath(configPath: string | undefined, homeDirectory: string): string {
  if (configPath) {
    return expandTilde(configPath, homeDirectory);
  }
  return resolve(homeDirectory, '.scrutari', 'config.yaml');
}

export async function initCommand(options: InitCommandOptions = {}): Promise<void> {
  const log = options.logger ?? console.log;
  const homeDirectory = options.homeDir ?? homedir();

  const configPath = resolveConfigPath(options.configPath, homeDirectory);
  const configDir = dirname(configPath);
  const skillsDir = resolve(homeDirectory, '.scrutari', 'skills');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    log(chalk.green('Created directory:'), configDir);
  }

  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
    log(chalk.green('Created directory:'), skillsDir);
  }

  if (existsSync(configPath)) {
    log(chalk.yellow('Config already exists at:'), configPath);
    log(chalk.yellow('Run with --config <path> to use a different location.'));
    return;
  }

  const configTemplate = `# Scrutari Configuration
# https://github.com/scrutari/scrutari

# LLM Provider Configuration
providers:
  anthropic:
    # API key from https://console.anthropic.com/
    # Use "env:ANTHROPIC_API_KEY" or "$ANTHROPIC_API_KEY" to read from env
    api_key: env:ANTHROPIC_API_KEY
    default_model: "claude-sonnet-4-20250514"
  
  openai:
    # API key from https://platform.openai.com/api-keys
    # Use "env:OPENAI_API_KEY" or "$OPENAI_API_KEY" to read from env
    api_key: env:OPENAI_API_KEY
    default_model: "gpt-4o"

# Default settings
defaults:
  provider: anthropic           # anthropic | openai
  model: claude-sonnet-4-20250514
  max_budget_usd: 5.0          # Cost cap per analysis run
  output_format: markdown      # markdown | json | docx
  output_dir: "./output"

# MCP Server Configuration
mcp:
  servers:
    # Example external MCP servers:
    # - name: "bloomberg"
    #   command: "npx"
    #   args: ["-y", "@bloomberg/mcp-server"]
    # - name: "custom-db"
    #   url: "http://localhost:3001/mcp"

# Skills directory (custom skills will be merged with built-in)
skills_dir: "~/.scrutari/skills"
`;

  writeFileSync(configPath, configTemplate, 'utf-8');
  log(chalk.green('Created config file:'), configPath);
  log('');
  log(chalk.cyan('Next steps:'));
  log('  1. Edit', configPath);
  log('  2. Add your API keys or set environment variables');
  log('  3. Run', chalk.green('scrutari analyze "AAPL earnings analysis"'));
}
