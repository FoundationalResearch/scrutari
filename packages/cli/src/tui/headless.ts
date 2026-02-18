import chalk from 'chalk';
import ora from 'ora';
import type {
  StageStartEvent,
  StageStreamEvent,
  StageCompleteEvent,
  StageErrorEvent,
} from '@scrutari/core';
import type { AnalysisProps } from './types.js';

export async function runHeadless(props: AnalysisProps): Promise<void> {
  const { ticker, skill, model, budgetUsd, pipeline, verbose } = props;

  console.log('');
  console.log(chalk.cyan.bold('scrutari') + chalk.dim(' | headless mode'));
  console.log(`Analyzing: ${chalk.green.bold(ticker)}`);
  console.log(`Skill: ${chalk.white(skill)}  Model: ${chalk.white(model)}`);
  console.log(`Budget: ${chalk.white('$' + budgetUsd.toFixed(2))}`);
  console.log('');

  if (!pipeline) {
    console.log(chalk.yellow('No pipeline engine provided.'));
    return;
  }

  let totalCost = 0;
  let currentStageName = '';
  let activeSpinner = ora();

  pipeline.on('stage:start', (event: StageStartEvent) => {
    currentStageName = event.stageName;
    activeSpinner = ora({
      text: `${chalk.bold(event.stageName)} ${chalk.dim(`(${event.model})`)}`,
      prefixText: chalk.dim(' '),
    }).start();
  });

  pipeline.on('stage:stream', (event: StageStreamEvent) => {
    if (verbose) {
      const truncated = event.chunk.replace(/\n/g, ' ').slice(0, 80);
      if (truncated.trim()) {
        activeSpinner.text = `${chalk.bold(event.stageName)} ${chalk.dim('—')} ${truncated}`;
      }
    }
  });

  pipeline.on('stage:complete', (event: StageCompleteEvent) => {
    totalCost += event.costUsd;

    activeSpinner.succeed(
      `${chalk.bold(event.stageName)}` +
      chalk.dim(`  ${(event.durationMs / 1000).toFixed(1)}s`) +
      chalk.dim(`  $${event.costUsd.toFixed(4)}`) +
      chalk.dim(`  ${totalCost.toFixed(4)}/${budgetUsd.toFixed(2)}`),
    );

    if (verbose && event.content) {
      const preview = event.content.split('\n').slice(0, 2).join('\n');
      if (preview.trim()) {
        console.log(chalk.dim(`    ${preview.slice(0, 120)}`));
      }
    }
  });

  pipeline.on('stage:error', (event: StageErrorEvent) => {
    activeSpinner.fail(
      `${chalk.bold(event.stageName)} ${chalk.red(event.error.message)}`,
    );
  });

  try {
    const result = await pipeline.run();

    console.log('');
    console.log(chalk.green.bold('\u2713 Analysis complete'));
    console.log(chalk.dim(`  Total cost: $${result.totalCostUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}`));
    console.log(chalk.dim(`  Stages: ${result.stagesCompleted} completed`));
    console.log(chalk.dim(`  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`));
    console.log('');
  } catch (err) {
    activeSpinner.fail(chalk.red('Pipeline failed'));
    console.log('');
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red.bold('\u2717 Analysis failed'));
    console.log(chalk.red(`  ${message}`));
    if (currentStageName) {
      console.log(chalk.dim(`  Failed during stage: ${currentStageName}`));
    }
    console.log('');
    throw err;
  }
}
