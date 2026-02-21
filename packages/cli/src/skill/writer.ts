import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { stringify as toYaml, parse as parseYaml } from 'yaml';
import { SkillSchema } from '@scrutari/core';

export interface SkillDefinition {
  name: string;
  description: string;
  inputs?: Array<{
    name: string;
    type: 'string' | 'string[]' | 'number' | 'boolean';
    required?: boolean;
    default?: string | number | boolean | string[];
    description?: string;
  }>;
  stages: Array<{
    name: string;
    model?: string;
    prompt: string;
    tools?: string[];
    input_from?: string[];
    output_format?: 'json' | 'markdown' | 'text';
  }>;
  output: {
    primary: string;
    format?: 'markdown' | 'json' | 'docx';
  };
  tools_required?: string[];
  tools_optional?: string[];
}

/**
 * Generate valid skill YAML from a SkillDefinition.
 */
export function generateSkillYaml(definition: SkillDefinition): string {
  const skill: Record<string, unknown> = {
    name: definition.name,
    description: definition.description,
  };

  if (definition.inputs && definition.inputs.length > 0) {
    skill.inputs = definition.inputs;
  }

  if (definition.tools_required && definition.tools_required.length > 0) {
    skill.tools_required = definition.tools_required;
  }

  if (definition.tools_optional && definition.tools_optional.length > 0) {
    skill.tools_optional = definition.tools_optional;
  }

  skill.stages = definition.stages;
  skill.output = definition.output;

  return toYaml(skill, { lineWidth: 100 });
}

/**
 * Validate a SkillDefinition against the SkillSchema, generate YAML,
 * and write to ~/.scrutari/skills/<name>.yaml.
 * Returns the file path where the skill was written.
 */
export function writeSkillFile(definition: SkillDefinition): string {
  // Validate before writing
  const yaml = generateSkillYaml(definition);

  // Round-trip validate: parse the generated YAML and validate
  const parsed = parseYaml(yaml);
  const result = SkillSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message).join('; ');
    throw new Error(`Generated skill YAML is invalid: ${messages}`);
  }

  const skillsDir = resolve(homedir(), '.scrutari', 'skills');
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  const filePath = join(skillsDir, `${definition.name}.yaml`);
  writeFileSync(filePath, yaml, 'utf-8');

  return filePath;
}
