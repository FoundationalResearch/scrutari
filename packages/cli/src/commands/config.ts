import { Command } from 'commander';
import chalk from 'chalk';
import { stringify } from 'yaml';
import { initCommand } from './init.js';
import { getConfig, type GlobalOptions } from '../context.js';
import { setConfigValue, getConfigPath } from '../config/index.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage scrutari configuration');

  config
    .command('init')
    .description('Initialize scrutari config in ~/.scrutari/')
    .action(async (_options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      await initCommand({ configPath: globalOpts.config });
    });

  config
    .command('show')
    .description('Show current configuration')
    .action(async (_options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const cfg = getConfig();

      if (globalOpts.json) {
        console.log(JSON.stringify(cfg, null, 2));
      } else {
        console.log(chalk.bold('Current configuration:\n'));
        console.log(stringify(cfg));
      }
    });

  config
    .command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key (dot-notation, e.g. defaults.provider)')
    .argument('<value>', 'Value to set')
    .action(async (key: string, value: string, _options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();

      setConfigValue(key, value, { configPath: globalOpts.config });

      const configPath = getConfigPath(globalOpts.config);
      console.log(chalk.green(`Set ${chalk.bold(key)} = ${chalk.bold(value)}`));
      console.log(chalk.dim(`Config: ${configPath}`));
    });
}
