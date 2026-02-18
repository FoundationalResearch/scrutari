import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigWithMeta } from './config/index.js';
import { setConfig, type GlobalOptions } from './context.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerCompareCommand } from './commands/compare.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerConfigCommand } from './commands/config.js';
import { registerMcpCommand } from './commands/mcp.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('scrutari')
    .description('Deep market analysis CLI powered by LLMs')
    .version('0.1.0')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--json', 'Machine-readable JSON output')
    .option('--no-tui', 'Force headless mode (no TUI)')
    .option('-c, --config <path>', 'Path to config file');

  registerAnalyzeCommand(program);
  registerCompareCommand(program);
  registerSkillsCommand(program);
  registerConfigCommand(program);
  registerMcpCommand(program);

  program.hook('preAction', (_thisCommand, actionCommand) => {
    const chain = getCommandChain(actionCommand, program);

    // Skip config loading for 'config init'
    if (chain[0] === 'config' && chain[1] === 'init') {
      return;
    }

    const opts = actionCommand.optsWithGlobals<GlobalOptions>();
    const { config, configFileExists, envKeysUsed } = loadConfigWithMeta({ configPath: opts.config });

    // First-run onboarding: no config file, but env vars detected
    if (!configFileExists && envKeysUsed.length > 0 && !opts.json) {
      const keys = envKeysUsed.join(', ');
      console.error(chalk.cyan(`  Using ${keys} from environment.`));
      console.error(chalk.dim(`  Run "scrutari init" to create a config file for more options.\n`));
    }

    // Check if any API key is available for commands that need one
    const needsApiKey = chain[0] === 'analyze' || chain[0] === 'compare';
    const hasAnyKey = config.providers.anthropic.api_key || config.providers.openai.api_key;

    if (needsApiKey && !hasAnyKey) {
      console.error(chalk.red('No API key found.\n'));
      console.error(chalk.white('Quick start (no config needed):'));
      console.error(chalk.green('  export ANTHROPIC_API_KEY=sk-ant-...\n'));
      console.error(chalk.white('Or create a config file:'));
      console.error(chalk.green('  scrutari init\n'));
      console.error(chalk.dim('Get an API key at: https://console.anthropic.com/'));
      process.exit(1);
    }

    setConfig(config);
  });

  return program;
}

function getCommandChain(cmd: Command, root: Command): string[] {
  const chain: string[] = [];
  let current: Command | null = cmd;
  while (current && current !== root) {
    chain.unshift(current.name());
    current = current.parent;
  }
  return chain;
}
