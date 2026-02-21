import type { z } from 'zod';
import type { InputSchema, StageSchema, SkillOutputSchema, SkillSchema, ToolsConfigSchema, AgentSkillFrontmatterSchema } from './schema.js';

export type Skill = z.infer<typeof SkillSchema>;
export type SkillInput = z.infer<typeof InputSchema>;
export type SkillStage = z.infer<typeof StageSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

export type InputType = 'string' | 'string[]' | 'number' | 'boolean';
export type StageOutputFormat = 'json' | 'markdown' | 'text';
export type SkillOutputFormat = 'markdown' | 'json' | 'docx';

export interface SkillEntry {
  skill: Skill;
  filePath: string;
  source: 'built-in' | 'user';
}

// ---------------------------------------------------------------------------
// Agent Skill types (SKILL.md standard)
// ---------------------------------------------------------------------------

export type AgentSkillFrontmatter = z.infer<typeof AgentSkillFrontmatterSchema>;

export interface AgentSkillSummary {
  name: string;
  description: string;
  dirPath: string;
  source: 'built-in' | 'user';
  kind: 'agent';
}

export interface AgentSkill {
  frontmatter: AgentSkillFrontmatter;
  body: string;
  dirPath: string;
  source: 'built-in' | 'user';
  pipelineSkillPath?: string;
}

export interface AgentSkillEntry {
  skill: AgentSkill;
  dirPath: string;
  source: 'built-in' | 'user';
}

export interface UnifiedSkillSummary {
  name: string;
  description: string;
  kind: 'pipeline' | 'agent';
  source: 'built-in' | 'user';
  path: string;
}
