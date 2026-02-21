import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import { SkillSchema, AgentSkillFrontmatterSchema } from '@scrutari/core';

export interface InstallResult {
  name: string;
  filePath: string;
  source: string;
}

/**
 * Resolve a skill URL from shorthand or full URL.
 *
 * Formats:
 * - Full URL → passthrough
 * - user/repo/skill-name → https://raw.githubusercontent.com/user/repo/main/skills/skill-name.yaml
 * - user/repo/skill-name@branch → uses specified branch
 */
export function resolveSkillUrl(input: string): string {
  // Full URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }

  // Shorthand: user/repo/skill-name or user/repo/skill-name@branch
  const parts = input.split('/');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid skill reference: "${input}". ` +
      `Expected a URL or shorthand like "user/repo/skill-name" or "user/repo/skill-name@branch"`,
    );
  }

  const user = parts[0];
  const repo = parts[1];
  const skillPart = parts[2];

  let branch = 'main';
  let skillName = skillPart;

  if (skillPart.includes('@')) {
    const [name, branchPart] = skillPart.split('@');
    skillName = name;
    branch = branchPart;
  }

  return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/skills/${skillName}.yaml`;
}

/**
 * Install a skill from a URL or shorthand.
 * Fetches the YAML, validates against SkillSchema, writes to ~/.scrutari/skills/.
 */
export async function installSkill(urlOrShorthand: string): Promise<InstallResult> {
  const url = resolveSkillUrl(urlOrShorthand);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch skill: ${response.status} ${response.statusText} (${url})`);
  }

  const content = await response.text();

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    throw new Error('Downloaded content is not valid YAML');
  }

  const result = SkillSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message).join('; ');
    throw new Error(`Skill validation failed: ${messages}`);
  }

  const skill = result.data;
  const skillsDir = resolve(homedir(), '.scrutari', 'skills');
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  const filePath = join(skillsDir, `${skill.name}.yaml`);
  writeFileSync(filePath, content, 'utf-8');

  return { name: skill.name, filePath, source: url };
}

/**
 * Detect whether a URL or shorthand points to a pipeline skill or agent skill.
 * Pipeline if .yaml or .yml extension, agent otherwise.
 */
export function detectSkillType(urlOrShorthand: string): 'pipeline' | 'agent' {
  const lower = urlOrShorthand.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return 'pipeline';
  }
  // Check if shorthand resolves to a YAML URL
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    const parts = lower.split('/');
    if (parts.length === 3 && !parts[2].includes('.')) {
      // Ambiguous shorthand like user/repo/skill-name — check for @branch notation
      // Default to pipeline for backward compatibility
      return 'pipeline';
    }
  }
  // URLs not ending in yaml/yml are agent skills
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    if (lower.includes('/SKILL.md') || lower.endsWith('/')) {
      return 'agent';
    }
  }
  return 'pipeline';
}

/**
 * Install an agent skill from a GitHub URL.
 * Fetches SKILL.md, validates frontmatter, writes to ~/.scrutari/skills/<name>/.
 */
export async function installAgentSkill(urlOrShorthand: string): Promise<InstallResult> {
  let url: string;

  if (urlOrShorthand.startsWith('http://') || urlOrShorthand.startsWith('https://')) {
    url = urlOrShorthand;
  } else {
    // Shorthand: user/repo/skill-name → fetch SKILL.md from GitHub
    const parts = urlOrShorthand.split('/');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid agent skill reference: "${urlOrShorthand}". ` +
        `Expected a URL or shorthand like "user/repo/skill-name"`,
      );
    }
    const [user, repo, skillPart] = parts;
    let branch = 'main';
    let skillName = skillPart;
    if (skillPart.includes('@')) {
      [skillName, branch] = skillPart.split('@');
    }
    url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/skills/${skillName}/SKILL.md`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch agent skill: ${response.status} ${response.statusText} (${url})`);
  }

  const content = await response.text();

  // Validate it has proper frontmatter
  if (!content.startsWith('---')) {
    throw new Error('Downloaded content is not a valid SKILL.md (missing frontmatter)');
  }

  const secondDelimiter = content.indexOf('\n---', 3);
  if (secondDelimiter === -1) {
    throw new Error('Downloaded content is not a valid SKILL.md (missing closing frontmatter delimiter)');
  }

  const rawFrontmatter = content.slice(3, secondDelimiter).trim();
  let parsed: unknown;
  try {
    parsed = parseYaml(rawFrontmatter);
  } catch {
    throw new Error('Failed to parse YAML frontmatter in downloaded SKILL.md');
  }

  const result = AgentSkillFrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message).join('; ');
    throw new Error(`Agent skill validation failed: ${messages}`);
  }

  const skillName = result.data.name;
  const skillsDir = resolve(homedir(), '.scrutari', 'skills', skillName);
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  const filePath = join(skillsDir, 'SKILL.md');
  writeFileSync(filePath, content, 'utf-8');

  return { name: skillName, filePath, source: url };
}

/**
 * CLI wrapper for installSkill with formatted output.
 */
export async function installSkillCommand(urlOrShorthand: string): Promise<void> {
  console.log(chalk.blue(`\nInstalling skill from: ${urlOrShorthand}\n`));

  try {
    const skillType = detectSkillType(urlOrShorthand);
    const result = skillType === 'agent'
      ? await installAgentSkill(urlOrShorthand)
      : await installSkill(urlOrShorthand);
    console.log(chalk.green.bold(`  Installed ${skillType} skill successfully!`));
    console.log(`  Name: ${chalk.bold(result.name)}`);
    console.log(`  Path: ${result.filePath}`);
    console.log(`  Source: ${result.source}`);
    console.log('');
  } catch (err) {
    console.error(chalk.red.bold(`  Installation failed: ${err instanceof Error ? err.message : String(err)}`));
    console.error('');
    process.exit(1);
  }
}
