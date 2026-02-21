import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { scanSkillSummaries, scanAgentSkillSummaries } from '@scrutari/core';

function getBuiltInSkillsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  const bundledPath = resolve(thisDir, '..', 'skills');
  if (existsSync(bundledPath)) return bundledPath;
  const tscPath = resolve(thisDir, '..', '..', '..', '..', 'skills');
  if (existsSync(tscPath)) return tscPath;
  const devPath = resolve(thisDir, '..', '..', 'skills');
  return devPath;
}

export async function listSkillsCommand(): Promise<void> {
  const builtInDir = getBuiltInSkillsDir();
  const userDir = resolve(homedir(), '.scrutari', 'skills');
  const pipelineSummaries = scanSkillSummaries(builtInDir, userDir);
  const agentSummaries = scanAgentSkillSummaries(builtInDir, userDir);

  if (pipelineSummaries.length === 0 && agentSummaries.length === 0) {
    console.log(chalk.dim('No skills found.'));
    return;
  }

  if (pipelineSummaries.length > 0) {
    console.log(chalk.blue.bold('\nPipeline Skills\n'));
    const maxNameLen = Math.max(...pipelineSummaries.map(s => s.name.length));
    for (const s of pipelineSummaries) {
      const name = chalk.bold(s.name.padEnd(maxNameLen));
      const source = chalk.dim(`[${s.source}]`);
      console.log(`  ${name}  ${s.description}  ${source}`);
    }
  }

  if (agentSummaries.length > 0) {
    console.log(chalk.blue.bold('\nAgent Skills\n'));
    const maxNameLen = Math.max(...agentSummaries.map(s => s.name.length));
    for (const s of agentSummaries) {
      const name = chalk.bold(s.name.padEnd(maxNameLen));
      const source = chalk.dim(`[${s.source}]`);
      console.log(`  ${name}  ${s.description}  ${source}`);
    }
  }

  const total = pipelineSummaries.length + agentSummaries.length;
  console.log(chalk.dim(`\n  ${total} skill(s) found (${pipelineSummaries.length} pipeline, ${agentSummaries.length} agent).`));
  console.log(chalk.dim('  User skills directory: ~/.scrutari/skills/\n'));
}
