import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { parse } from 'yaml';
import { getConfig, type GlobalOptions } from '../context.js';

function getBuiltInSkillsDir(): string {
  // Works with both tsup bundle (dist/index.js) and tsc output (dist/commands/skills.js)
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // tsup bundle: dist/index.js -> ../skills/
  const bundledPath = resolve(thisDir, '..', 'skills');
  if (existsSync(bundledPath)) return bundledPath;

  // tsc dev layout: dist/commands/skills.js -> ../../../../skills/
  const tscPath = resolve(thisDir, '..', '..', '..', '..', 'skills');
  return tscPath;
}

function getUserSkillsDir(): string {
  try {
    const config = getConfig();
    const dir = config.skills_dir;
    if (dir.startsWith('~/')) {
      return resolve(homedir(), dir.slice(2));
    }
    if (dir === '~') {
      return homedir();
    }
    return resolve(dir);
  } catch {
    return resolve(homedir(), '.scrutari', 'skills');
  }
}

interface SkillFile {
  name: string;
  path: string;
  source: 'built-in' | 'user';
}

function scanSkills(): SkillFile[] {
  const skills: SkillFile[] = [];

  const builtInDir = getBuiltInSkillsDir();
  if (existsSync(builtInDir)) {
    for (const file of readdirSync(builtInDir)) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const ext = file.endsWith('.yaml') ? '.yaml' : '.yml';
        skills.push({
          name: basename(file, ext),
          path: resolve(builtInDir, file),
          source: 'built-in',
        });
      }
    }
  }

  const userDir = getUserSkillsDir();
  if (existsSync(userDir)) {
    for (const file of readdirSync(userDir)) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const ext = file.endsWith('.yaml') ? '.yaml' : '.yml';
        skills.push({
          name: basename(file, ext),
          path: resolve(userDir, file),
          source: 'user',
        });
      }
    }
  }

  return skills;
}

function findSkill(name: string): SkillFile | undefined {
  const skills = scanSkills();
  // User skills take priority
  return skills.find(s => s.name === name && s.source === 'user')
    ?? skills.find(s => s.name === name);
}

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage analysis skills');

  skills
    .command('list')
    .description('List available skills')
    .action(async (_options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const found = scanSkills();

      if (found.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
      }

      if (globalOpts.json) {
        console.log(JSON.stringify(found, null, 2));
        return;
      }

      console.log(chalk.bold('Available skills:\n'));
      for (const skill of found) {
        const tag = skill.source === 'built-in'
          ? chalk.dim('[built-in]')
          : chalk.green('[user]');

        let description = '';
        try {
          const content = parse(readFileSync(skill.path, 'utf-8')) as Record<string, unknown>;
          description = (content.description as string) ?? '';
        } catch {
          // ignore parse errors
        }

        console.log(`  ${chalk.cyan(skill.name)} ${tag}`);
        if (description) {
          console.log(`    ${chalk.dim(description)}`);
        }
      }
    });

  skills
    .command('show')
    .description('Show details of a skill')
    .argument('<name>', 'Skill name')
    .action(async (name: string, _options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const skill = findSkill(name);

      if (!skill) {
        console.error(chalk.red(`Skill "${name}" not found.`));
        process.exit(1);
      }

      const content = readFileSync(skill.path, 'utf-8');
      const parsed = parse(content) as Record<string, unknown>;

      if (globalOpts.json) {
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log(chalk.bold(`Skill: ${name}`) + ` ${chalk.dim(`[${skill.source}]`)}`);
        console.log(chalk.dim(`Path: ${skill.path}\n`));
        console.log(content);
      }
    });

  skills
    .command('create')
    .description('Create a new skill from template')
    .argument('<name>', 'Name for the new skill')
    .action(async (name: string) => {
      const userDir = getUserSkillsDir();

      if (!existsSync(userDir)) {
        mkdirSync(userDir, { recursive: true });
      }

      const skillPath = resolve(userDir, `${name}.yaml`);

      if (existsSync(skillPath)) {
        console.error(chalk.red(`Skill "${name}" already exists at ${skillPath}`));
        process.exit(1);
      }

      const template = `name: ${name}
description: Custom analysis skill
stages:
  - name: gather
    tools: [edgar, market-data]
  - name: analyze
    router: reasoning
  - name: synthesize
    output: report
`;

      writeFileSync(skillPath, template, 'utf-8');
      console.log(chalk.green(`Created skill "${name}" at ${skillPath}`));
      console.log(chalk.dim('Edit the file to customize your skill.'));
    });
}
