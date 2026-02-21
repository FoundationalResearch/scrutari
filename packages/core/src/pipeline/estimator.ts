import type { AgentType, AgentDefaults } from './agent-types.js';
import { resolveAgentType, getAgentDefaults } from './agent-types.js';
import { calculateCost } from '../router/cost.js';
import { computeExecutionLevels } from '../skills/loader.js';
import type { Skill, SkillEntry } from '../skills/types.js';

export interface StageEstimate {
  stageName: string;
  model: string;
  agentType: AgentType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  estimatedTimeSeconds: number;
  tools: string[];
}

export interface PipelineEstimate {
  skillName: string;
  stages: StageEstimate[];
  executionLevels: string[][];
  totalEstimatedCostUsd: number;
  totalEstimatedTimeSeconds: number;
  toolsRequired: string[];
  toolsOptional: string[];
}

/**
 * Approximate output tokens per second for common models.
 * Used for time estimation only — not for billing.
 */
const MODEL_SPEED_TOKENS_PER_SEC: Record<string, number> = {
  // Anthropic
  'claude-haiku-3-5-20241022': 100,
  'claude-sonnet-4-20250514': 80,
  'claude-opus-4-20250514': 40,
  // OpenAI
  'gpt-4o': 80,
  'gpt-4o-mini': 120,
  'gpt-4-turbo': 40,
  // Google
  'gemini-2.5-flash': 150,
  'gemini-2.5-pro': 60,
};

const DEFAULT_SPEED_TOKENS_PER_SEC = 60;
const BASE_LATENCY_SECONDS = 2;

/**
 * Estimate time for a single stage based on model speed and output tokens.
 */
export function estimateStageTime(model: string, outputTokens: number): number {
  const speed = MODEL_SPEED_TOKENS_PER_SEC[model] ?? DEFAULT_SPEED_TOKENS_PER_SEC;
  return BASE_LATENCY_SECONDS + outputTokens / speed;
}

/**
 * Estimate the cost of running a pipeline for a given skill, without executing it.
 * For sub_pipeline stages, recursively estimates the sub-skill's cost if loadSkill is provided.
 */
export function estimatePipelineCost(
  skill: Skill,
  modelOverride?: string,
  agentConfig?: Partial<Record<AgentType, Partial<AgentDefaults>>>,
  loadSkill?: (name: string) => SkillEntry | undefined,
  remapModel?: (modelId: string) => string,
): PipelineEstimate {
  const stages: StageEstimate[] = [];

  for (const stage of skill.stages) {
    // Handle sub_pipeline stages: recursively estimate the sub-skill
    if (stage.sub_pipeline && loadSkill) {
      const entry = loadSkill(stage.sub_pipeline);
      if (entry) {
        const subEstimate = estimatePipelineCost(entry.skill, modelOverride, agentConfig, loadSkill, remapModel);
        // Add sub-pipeline stages with prefixed names
        for (const subStage of subEstimate.stages) {
          stages.push({
            ...subStage,
            stageName: `${stage.name}/${subStage.stageName}`,
          });
        }
        continue;
      }
      // Fallback: if skill not found, estimate as a default stage
    }

    const agentType = resolveAgentType(stage);
    const defaults = getAgentDefaults(agentType, agentConfig);
    const rawModel = modelOverride ?? stage.model ?? defaults.model;
    const model = remapModel ? remapModel(rawModel) : rawModel;
    const estimatedOutputTokens = stage.max_tokens ?? defaults.maxTokens;
    const estimatedInputTokens = estimatedOutputTokens * 2;
    const estimatedCostUsd = calculateCost(model, estimatedInputTokens, estimatedOutputTokens);

    const estimatedTimeSeconds = estimateStageTime(model, estimatedOutputTokens);

    stages.push({
      stageName: stage.name,
      model,
      agentType,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
      estimatedTimeSeconds,
      tools: stage.tools ?? [],
    });
  }

  const executionLevels = computeExecutionLevels(skill);
  const totalEstimatedCostUsd = stages.reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  // Total time accounts for parallelism: stages in the same level run concurrently (use max)
  const stageTimeMap = new Map(stages.map(s => [s.stageName, s.estimatedTimeSeconds]));
  const totalEstimatedTimeSeconds = executionLevels.reduce((sum, level) => {
    const levelMax = Math.max(...level.map(name => stageTimeMap.get(name) ?? 0));
    return sum + levelMax;
  }, 0);

  return {
    skillName: skill.name,
    stages,
    executionLevels,
    totalEstimatedCostUsd,
    totalEstimatedTimeSeconds,
    toolsRequired: skill.tools_required ?? [],
    toolsOptional: skill.tools_optional ?? [],
  };
}
