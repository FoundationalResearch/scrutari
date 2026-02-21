import type { SkillStage } from '../skills/types.js';

export type AgentType = 'research' | 'explore' | 'verify' | 'default';

export interface AgentDefaults {
  model: string;
  maxTokens: number;
  temperature: number;
  maxToolSteps: number;
}

export const AGENT_DEFAULTS: Record<AgentType, AgentDefaults> = {
  research: { model: 'claude-sonnet-4-20250514', maxTokens: 8192, temperature: 0.1, maxToolSteps: 15 },
  explore:  { model: 'claude-haiku-3-5-20241022', maxTokens: 2048, temperature: 0,   maxToolSteps: 5 },
  verify:   { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.1, maxToolSteps: 10 },
  default:  { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.3, maxToolSteps: 10 },
};

/**
 * Resolve the agent type for a skill stage.
 *
 * Priority:
 * 1. Explicit stage.agent_type field
 * 2. Inference from stage properties:
 *    - name contains "verify" → verify
 *    - has tools + output_format json → research
 *    - has tools + no input_from (gather stage) → explore
 *    - else → default
 */
export function resolveAgentType(stage: SkillStage): AgentType {
  // Explicit agent_type takes priority
  if (stage.agent_type) {
    return stage.agent_type;
  }

  // Inference from stage name and properties
  if (stage.name === 'verify' || stage.name.includes('verify')) {
    return 'verify';
  }

  const hasTools = stage.tools !== undefined && stage.tools.length > 0;
  const hasInputFrom = stage.input_from !== undefined && stage.input_from.length > 0;

  if (hasTools && stage.output_format === 'json') {
    return 'research';
  }

  if (hasTools && !hasInputFrom) {
    return 'explore';
  }

  return 'default';
}

/**
 * Get agent defaults, merging user config overrides with built-in defaults.
 */
export function getAgentDefaults(
  agentType: AgentType,
  configOverrides?: Partial<Record<AgentType, Partial<AgentDefaults>>>,
): AgentDefaults {
  const base = AGENT_DEFAULTS[agentType];
  const overrides = configOverrides?.[agentType];

  if (!overrides) {
    return { ...base };
  }

  return {
    model: overrides.model ?? base.model,
    maxTokens: overrides.maxTokens ?? base.maxTokens,
    temperature: overrides.temperature ?? base.temperature,
    maxToolSteps: overrides.maxToolSteps ?? base.maxToolSteps,
  };
}
