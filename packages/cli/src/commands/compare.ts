import { Command } from 'commander';
import chalk from 'chalk';
import type { GlobalOptions } from '../context.js';

interface CompareOptions {
  skill?: string;
}

export function registerCompareCommand(program: Command): void {
  program
    .command('compare')
    .description('Compare multiple tickers')
    .argument('<tickers...>', 'Stock ticker symbols to compare (minimum 2)')
    .option('-s, --skill <name>', 'Skill to use for comparison', 'comp-analysis')
    .action(async (tickers: string[], options: CompareOptions, command: Command) => {
      if (tickers.length < 2) {
        console.error(chalk.red('At least 2 tickers are required for comparison.'));
        process.exit(1);
      }

      const globalOpts = command.optsWithGlobals<GlobalOptions>();

      if (globalOpts.json) {
        console.log(JSON.stringify({ command: 'compare', tickers, skill: options.skill }));
      } else {
        console.log(chalk.cyan(`Comparing ${tickers.map(t => chalk.bold(t)).join(', ')}...`));
        console.log(chalk.dim(`Skill: ${options.skill}`));
      }
    });
}
