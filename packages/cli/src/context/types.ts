import type { z } from 'zod';
import type { PreferencesSchema } from './preferences.js';
import type { RuleSchema, PersonaSchema } from './schemas.js';

export type Preferences = z.infer<typeof PreferencesSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Persona = z.infer<typeof PersonaSchema>;

export interface Instructions {
  global?: string;
  project?: string;
  local?: string;
  session?: string;
}

export interface LoadedRule {
  rule: Rule;
  filePath: string;
  source: 'global' | 'project';
}

export interface LoadedPersona {
  persona: Persona;
  filePath: string;
  source: 'built-in' | 'user';
}

export interface UserMemoryTicker {
  ticker: string;
  count: number;
  last_used: number;
}

export interface UserMemoryAnalysis {
  skill: string;
  ticker: string;
  timestamp: number;
}

export interface UserMemory {
  frequent_tickers: UserMemoryTicker[];
  analysis_history: UserMemoryAnalysis[];
  preferred_depth: Record<string, number>;
  output_format_history: Record<string, number>;
  updated_at: number;
}

export interface ContextBundle {
  instructions: Instructions;
  preferences: Preferences;
  rules: LoadedRule[];
  activePersona?: LoadedPersona;
  availablePersonas: string[];
  memory?: UserMemory;
}

export interface RuleMatchContext {
  ticker?: string;
  sector?: string;
  topic?: string;
}
