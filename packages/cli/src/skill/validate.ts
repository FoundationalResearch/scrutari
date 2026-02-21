import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import chalk from 'chalk';
import {
  loadSkillFile,
  loadAgentSkill,
  SkillLoadError,
  SkillValidationError,
  SkillCycleError,
  AgentSkillLoadError,
  AgentSkillValidationError,
} from '@scrutari/core';

export async function validateSkillCommand(filePath: string): Promise<void> {
  const resolved = resolve(filePath);

  // Detect if path is a directory (agent skill) or file (pipeline skill)
  let isDirectory = false;
  try {
    isDirectory = statSync(resolved).isDirectory();
  } catch {
    // Will be handled by the loader below
  }

  console.log(chalk.blue(`\nValidating: ${resolved}\n`));

  if (isDirectory) {
    validateAgentSkill(resolved);
  } else {
    validatePipelineSkill(resolved);
  }
}

function validatePipelineSkill(resolved: string): void {
  try {
    const entry = loadSkillFile(resolved, 'user');
    const skill = entry.skill;

    console.log(chalk.green.bold('  Valid pipeline skill!'));
    console.log(`  Name: ${chalk.bold(skill.name)}`);
    console.log(`  Description: ${skill.description}`);
    console.log(`  Stages: ${skill.stages.length}`);

    if (skill.inputs && skill.inputs.length > 0) {
      console.log(`  Inputs: ${skill.inputs.map(i => `${i.name} (${i.type})`).join(', ')}`);
    }

    if (skill.tools_required && skill.tools_required.length > 0) {
      console.log(`  Tools required: ${skill.tools_required.join(', ')}`);
    }

    console.log(`  Output: ${skill.output.primary} (${skill.output.format ?? 'markdown'})`);
    console.log('');
  } catch (err) {
    if (err instanceof SkillValidationError) {
      console.error(chalk.red.bold('  Validation failed:'));
      for (const issue of err.issues) {
        console.error(chalk.red(`    - ${issue.message}`));
      }
    } else if (err instanceof SkillCycleError) {
      console.error(chalk.red.bold('  Cycle detected:'));
      console.error(chalk.red(`    ${err.cycle.join(' → ')}`));
    } else if (err instanceof SkillLoadError) {
      console.error(chalk.red.bold(`  Load error: ${err.message}`));
    } else {
      console.error(chalk.red(`  Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
    }
    console.error('');
    process.exit(1);
  }
}

function validateAgentSkill(resolved: string): void {
  try {
    const skill = loadAgentSkill(resolved, 'user');

    console.log(chalk.green.bold('  Valid agent skill!'));
    console.log(`  Name: ${chalk.bold(skill.frontmatter.name)}`);
    console.log(`  Description: ${skill.frontmatter.description}`);
    console.log(`  Body: ${skill.body.length} characters`);

    if (skill.frontmatter.metadata) {
      const meta = Object.entries(skill.frontmatter.metadata).map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(`  Metadata: ${meta}`);
    }

    if (skill.pipelineSkillPath) {
      console.log(`  Co-located pipeline: ${skill.pipelineSkillPath}`);
    }

    console.log('');
  } catch (err) {
    if (err instanceof AgentSkillValidationError) {
      console.error(chalk.red.bold('  Validation failed:'));
      for (const issue of err.issues) {
        console.error(chalk.red(`    - ${issue}`));
      }
    } else if (err instanceof AgentSkillLoadError) {
      console.error(chalk.red.bold(`  Load error: ${err.message}`));
    } else {
      console.error(chalk.red(`  Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
    }
    console.error('');
    process.exit(1);
  }
}
