import type { ToolSet } from 'ai';
import type { CostTracker } from '../router/cost.js';
import type { ProviderRegistry } from '../router/providers.js';
import { callLLM, streamLLM } from '../router/llm.js';
import { substituteVariables } from '../skills/loader.js';
import type { SkillStage } from '../skills/types.js';
import type { AgentDefaults } from './agent-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Function that resolves stage tool group names into AI SDK tool map. */
export type ToolResolver = (toolGroupNames: string[]) => Record<string, unknown>;

export interface TaskAgentContext {
  stage: SkillStage;
  modelId: string;
  agentDefaults: AgentDefaults;
  inputs: Record<string, string | string[] | number | boolean>;
  /** Snapshot of prior stage outputs — read-only. */
  priorOutputs: ReadonlyMap<string, string>;
  costTracker: CostTracker;
  maxBudgetUsd: number;
  providers: ProviderRegistry;
  resolveTools?: ToolResolver;
  abortSignal?: AbortSignal;
  /** Delegate events to the pipeline engine. */
  emit: (event: string, data: unknown) => void;
}

export interface TaskAgentResult {
  stageName: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number;
}

export type TaskAgentOutcome =
  | { status: 'success'; result: TaskAgentResult }
  | { status: 'error'; error: Error; fatal: boolean };

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline stage as an independent task agent.
 *
 * Protocol:
 * - Receives read-only priorOutputs snapshot — never writes to shared state
 * - Returns outcome to parent, which merges results
 * - Shares CostTracker (uses reserve/finalize for parallel safety)
 * - Shares AbortSignal — parent can cancel on fatal error
 * - Emits events via delegated emit function
 */
export async function runTaskAgent(ctx: TaskAgentContext): Promise<TaskAgentOutcome> {
  const { stage, modelId, agentDefaults, inputs, priorOutputs, costTracker, providers, abortSignal, emit } = ctx;
  const stageStart = Date.now();

  try {
    // Build variable map from inputs + prior stage outputs
    const variables: Record<string, string | string[] | number | boolean> = { ...inputs };
    if (stage.input_from) {
      for (const dep of stage.input_from) {
        const depOutput = priorOutputs.get(dep);
        if (depOutput) {
          variables[dep] = depOutput;
        }
      }
    }

    const prompt = substituteVariables(stage.prompt ?? '', variables);

    let systemPrompt = 'You are an expert financial analyst. Complete the following analysis task. IMPORTANT: Always use the provided tools to fetch real-time data. Do not generate financial data, prices, or metrics from memory.';
    if (stage.output_format) {
      systemPrompt += ` Respond in ${stage.output_format} format.`;
    }

    // Include prior stage outputs as context
    const priorContext = buildPriorContext(stage, priorOutputs);
    const model = providers.getModel(modelId);
    const budget = { maxCostUsd: ctx.maxBudgetUsd, tracker: costTracker };
    const messages = [
      ...(priorContext ? [{ role: 'user' as const, content: priorContext }] : []),
      { role: 'user' as const, content: prompt },
    ];

    // Resolve tools for this stage if available
    const stageTools = resolveStageTools(stage, ctx.resolveTools);
    const hasTools = stageTools !== undefined;

    // Use agent defaults for max_tokens, temperature, and maxToolSteps
    const maxTokens = stage.max_tokens ?? agentDefaults.maxTokens;
    const temperature = stage.temperature ?? agentDefaults.temperature;
    const maxToolSteps = agentDefaults.maxToolSteps;

    let result: { content: string; inputTokens: number; outputTokens: number };

    if (hasTools) {
      result = await executeWithTools(
        stage, modelId, model, systemPrompt, messages, stageTools,
        budget, abortSignal, emit, maxTokens, temperature, maxToolSteps,
      );
    } else {
      result = await executeStreaming(
        stage, model, modelId, systemPrompt, messages,
        budget, abortSignal, emit, maxTokens, temperature,
      );
    }

    const durationMs = Date.now() - stageStart;

    return {
      status: 'success',
      result: {
        stageName: stage.name,
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
        costUsd: 0, // Actual cost tracked through costTracker
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      status: 'error',
      error,
      fatal: isFatalError(err, abortSignal),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function executeStreaming(
  stage: SkillStage,
  model: ReturnType<ProviderRegistry['getModel']>,
  modelId: string,
  systemPrompt: string,
  messages: Array<{ role: 'user'; content: string }>,
  budget: { maxCostUsd: number; tracker: CostTracker },
  abortSignal: AbortSignal | undefined,
  emit: (event: string, data: unknown) => void,
  maxTokens: number | undefined,
  temperature: number | undefined,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { stream, response } = streamLLM({
    model,
    modelId,
    system: systemPrompt,
    messages,
    maxOutputTokens: maxTokens,
    temperature,
    budget,
    abortSignal,
  });

  let fullContent = '';
  for await (const chunk of stream) {
    fullContent += chunk;
    emit('stage:stream', { stageName: stage.name, chunk });
  }

  const llmResponse = await response;

  return {
    content: llmResponse.content || fullContent,
    inputTokens: llmResponse.usage.inputTokens,
    outputTokens: llmResponse.usage.outputTokens,
  };
}

async function executeWithTools(
  stage: SkillStage,
  modelId: string,
  model: ReturnType<ProviderRegistry['getModel']>,
  systemPrompt: string,
  messages: Array<{ role: 'user'; content: string }>,
  tools: ToolSet,
  budget: { maxCostUsd: number; tracker: CostTracker },
  abortSignal: AbortSignal | undefined,
  emit: (event: string, data: unknown) => void,
  maxTokens: number | undefined,
  temperature: number | undefined,
  maxToolSteps: number,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  // Use AI SDK's built-in multi-step agent loop via stopWhen/stepCountIs.
  // This ensures tool results are automatically fed back to the LLM
  // so it can generate a response based on real data.
  const response = await callLLM({
    model,
    modelId,
    system: systemPrompt,
    messages,
    tools,
    maxOutputTokens: maxTokens,
    temperature,
    budget,
    abortSignal,
    maxToolSteps,
  });

  if (response.content) {
    emit('stage:stream', { stageName: stage.name, chunk: response.content });
  }

  return {
    content: response.content,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}

function resolveStageTools(stage: SkillStage, resolveTools?: ToolResolver): ToolSet | undefined {
  if (!stage.tools || stage.tools.length === 0 || !resolveTools) {
    return undefined;
  }
  const toolMap = resolveTools(stage.tools);
  if (Object.keys(toolMap).length === 0) return undefined;
  return toolMap as ToolSet;
}

function buildPriorContext(stage: SkillStage, priorOutputs: ReadonlyMap<string, string>): string {
  if (!stage.input_from || stage.input_from.length === 0) return '';

  const parts: string[] = [];
  for (const dep of stage.input_from) {
    const output = priorOutputs.get(dep);
    if (output) {
      parts.push(`--- Output from "${dep}" stage ---\n${output}`);
    }
  }
  return parts.join('\n\n');
}

function isFatalError(err: unknown, abortSignal?: AbortSignal): boolean {
  if (err instanceof Error && err.name === 'BudgetExceededError') return true;
  if (err instanceof Error && err.name === 'BudgetExceededRetryError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (abortSignal?.aborted) return true;
  return false;
}
