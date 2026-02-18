import type { z } from 'zod';
import type { InputSchema, StageSchema, SkillOutputSchema, SkillSchema, ToolsConfigSchema } from './schema.js';

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
