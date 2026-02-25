import { EventEmitter } from 'eventemitter3';
import { CostTracker } from '../router/cost.js';
import { ProviderRegistry, type ProviderConfig } from '../router/providers.js';
import { computeExecutionLevels } from '../skills/loader.js';
import type { Skill, SkillStage, SkillEntry } from '../skills/types.js';
import { substituteVariables } from '../skills/loader.js';
import { extractClaims } from '../verification/extractor.js';
import { linkClaims } from '../verification/linker.js';
import { generateReport } from '../verification/reporter.js';
import type { VerificationReport } from '../verification/types.js';
import { Semaphore } from './semaphore.js';
import { resolveAgentType, getAgentDefaults, type AgentType, type AgentDefaults } from './agent-types.js';
import { runTaskAgent } from './task-agent.js';
import type { HookManager } from '../hooks/manager.js';

// ---------------------------------------------------------------------------
// Pipeline event types
// ---------------------------------------------------------------------------

export interface StageStartEvent {
  stageName: string;
  model: string;
  stageIndex: number;
  totalStages: number;
  agentType?: AgentType;
}

export interface StageStreamEvent {
  stageName: string;
  chunk: string;
}

export interface StageCompleteEvent {
  stageName: string;
  model: string;
  content: string;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface StageErrorEvent {
  stageName: string;
  error: Error;
}

export interface PipelineCompleteEvent {
  totalDurationMs: number;
  totalCostUsd: number;
  stagesCompleted: number;
  outputs: Record<string, string>;
  primaryOutput: string;
  verificationReport?: VerificationReport;
  /** True if the pipeline completed with partial results due to errors. */
  partial?: boolean;
  /** Names of stages that failed (only set when partial=true). */
  failedStages?: string[];
  /** Names of stages skipped because dependencies failed. */
  skippedStages?: string[];
}

export interface PipelineErrorEvent {
  error: Error;
  stageName?: string;
}

export interface StageToolStartEvent {
  stageName: string;
  toolName: string;
  callId: string;
}

export interface StageToolEndEvent {
  stageName: string;
  toolName: string;
  callId: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface VerificationCompleteEvent {
  report: VerificationReport;
  stageName: string;
  durationMs: number;
}

export interface PipelineEvents {
  'stage:start': (event: StageStartEvent) => void;
  'stage:stream': (event: StageStreamEvent) => void;
  'stage:complete': (event: StageCompleteEvent) => void;
  'stage:error': (event: StageErrorEvent) => void;
  'stage:tool-start': (event: StageToolStartEvent) => void;
  'stage:tool-end': (event: StageToolEndEvent) => void;
  'pipeline:complete': (event: PipelineCompleteEvent) => void;
  'pipeline:error': (event: PipelineErrorEvent) => void;
  'tool:unavailable': (event: ToolUnavailableEvent) => void;
  'verification:complete': (event: VerificationCompleteEvent) => void;
}

// ---------------------------------------------------------------------------
// Tool resolver interface (decoupled from @scrutari/tools)
// ---------------------------------------------------------------------------

/**
 * Function that resolves stage tool group names (e.g., ['edgar', 'market-data'])
 * into an AI SDK-compatible tool map that can be passed to LLM calls.
 */
export type ToolResolver = (toolGroupNames: string[]) => Record<string, unknown>;

/**
 * Function that checks whether a tool name (group or individual) is available.
 * Used for pre-execution validation of required/optional tools.
 */
export type ToolAvailabilityChecker = (toolName: string) => boolean;

// ---------------------------------------------------------------------------
// Tool availability events
// ---------------------------------------------------------------------------

export interface ToolUnavailableEvent {
  toolName: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline context — carries inputs and stage outputs
// ---------------------------------------------------------------------------

export interface PipelineContext {
  skill: Skill;
  inputs: Record<string, string | string[] | number | boolean>;
  modelOverride?: string;
  maxBudgetUsd: number;
  providerConfig: ProviderConfig;
  /** Optional: resolves stage tool names to AI SDK ToolSet for LLM calls */
  resolveTools?: ToolResolver;
  /** Optional: checks if a tool name is available (for pre-execution validation) */
  isToolAvailable?: ToolAvailabilityChecker;
  /** Optional: tool-specific config from skill YAML tools_config section */
  toolsConfig?: Record<string, Record<string, unknown>>;
  /** Abort signal for Ctrl+C / graceful shutdown. */
  abortSignal?: AbortSignal;
  /** Maximum concurrent stage agents (default: 5). */
  maxConcurrency?: number;
  /** Per-agent-type config overrides from user config. */
  agentConfig?: Partial<Record<AgentType, Partial<AgentDefaults>>>;
  /** Optional: resolves skill name to SkillEntry for sub_pipeline stages */
  loadSkill?: (name: string) => SkillEntry | undefined;
  /** Optional: shared cost tracker (for sub-pipelines to share budget with parent) */
  sharedCostTracker?: CostTracker;
  /** Optional: hook manager for lifecycle hooks */
  hookManager?: HookManager;
}

// ---------------------------------------------------------------------------
// Pipeline engine
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENCY = 5;
const MAX_SUB_PIPELINE_DEPTH = 5;

export class PipelineEngine extends EventEmitter<PipelineEvents> {
  private readonly context: PipelineContext;
  private readonly costTracker: CostTracker;
  private readonly providers: ProviderRegistry;
  private readonly stageOutputs = new Map<string, string>();
  private _verificationReport?: VerificationReport;
  private readonly depth: number;

  constructor(context: PipelineContext, depth = 0) {
    super();
    this.context = context;
    this.costTracker = context.sharedCostTracker ?? new CostTracker();
    this.providers = new ProviderRegistry(context.providerConfig);
    this.depth = depth;
  }

  get totalCost(): number {
    return this.costTracker.totalSpent;
  }

  get outputs(): Record<string, string> {
    return Object.fromEntries(this.stageOutputs);
  }

  get verificationReport(): VerificationReport | undefined {
    return this._verificationReport;
  }

  async run(): Promise<PipelineCompleteEvent> {
    const { skill, inputs, modelOverride, maxBudgetUsd } = this.context;

    // Validate tool availability before execution
    this.validateToolAvailability();

    // pre_pipeline hook (blocking — failure aborts pipeline)
    if (this.context.hookManager?.hasHooks('pre_pipeline')) {
      await this.context.hookManager.emit('pre_pipeline', {
        skill_name: skill.name,
        inputs: { ...inputs },
      });
    }

    const levels = computeExecutionLevels(skill);
    const stageMap = new Map(skill.stages.map(s => [s.name, s]));
    const totalStages = skill.stages.length;
    const pipelineStart = Date.now();
    let stagesCompleted = 0;
    let globalStageIndex = 0;
    const failedStages: string[] = [];
    const skippedStages: string[] = [];

    // Create fatal abort controller — combines with user's abort signal
    const fatalController = new AbortController();
    const combinedSignal = combineAbortSignals(this.context.abortSignal, fatalController.signal);

    const semaphore = new Semaphore(this.context.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

    try {
      for (const level of levels) {
        // Check if pipeline should stop
        if (combinedSignal.aborted) {
          for (const stageName of level) {
            skippedStages.push(stageName);
          }
          continue;
        }

        // Partition level into runnable vs skipped stages
        const runnableStages: Array<{ stage: SkillStage; stageIndex: number }> = [];
        for (const stageName of level) {
          const stage = stageMap.get(stageName)!;

          if (combinedSignal.aborted) {
            skippedStages.push(stageName);
            continue;
          }

          if (this.shouldSkipStage(stage, failedStages)) {
            skippedStages.push(stageName);
            this.emit('stage:error', {
              stageName,
              error: new Error(`Skipped: dependency stage(s) failed`),
            });
            continue;
          }

          runnableStages.push({ stage, stageIndex: globalStageIndex++ });
        }

        // Run all stages in this level concurrently (bounded by semaphore)
        const agentPromises = runnableStages.map(({ stage, stageIndex }) => {
          const agentType = resolveAgentType(stage);
          const agentDefaults = getAgentDefaults(agentType, this.context.agentConfig);

          // Model resolution chain: modelOverride > stage.model > agentConfig > agentDefaults
          // Then remap to an available provider if the resolved model's provider has no API key
          const resolvedModel = this.providers.remapModel(
            modelOverride ?? stage.model ?? agentDefaults.model,
          );

          this.emit('stage:start', {
            stageName: stage.name,
            model: resolvedModel,
            stageIndex,
            totalStages,
            agentType,
          });

          const costBefore = this.costTracker.totalSpent;

          // Take a read-only snapshot of current stage outputs
          const priorOutputs: ReadonlyMap<string, string> = new Map(this.stageOutputs);

          return semaphore.run(async () => {
            // pre_stage hook (blocking — failure aborts stage)
            if (this.context.hookManager?.hasHooks('pre_stage')) {
              await this.context.hookManager.emit('pre_stage', {
                stage_name: stage.name,
                skill_name: skill.name,
                model: resolvedModel,
                stage_index: stageIndex,
                total_stages: totalStages,
              });
            }

            // Branch: sub_pipeline stages run a nested pipeline
            if (stage.sub_pipeline) {
              const outcome = await this.runSubPipeline(stage, combinedSignal);
              return { stage, resolvedModel, outcome, costBefore };
            }

            const outcome = await runTaskAgent({
              stage,
              modelId: resolvedModel,
              agentDefaults,
              inputs,
              priorOutputs,
              costTracker: this.costTracker,
              maxBudgetUsd,
              providers: this.providers,
              resolveTools: this.context.resolveTools,
              abortSignal: combinedSignal,
              emit: (event: string, data: unknown) => {
                this.emit(event as keyof PipelineEvents, data as never);
              },
            });

            return { stage, resolvedModel, outcome, costBefore };
          });
        });

        const results = await Promise.allSettled(agentPromises);

        // Process outcomes
        for (const settled of results) {
          if (settled.status === 'rejected') {
            // Should not happen since runTaskAgent catches errors
            continue;
          }

          const { stage, resolvedModel, outcome, costBefore } = settled.value;

          if (outcome.status === 'success') {
            const { result } = outcome;
            this.stageOutputs.set(stage.name, result.content);
            stagesCompleted++;

            const stageCost = this.costTracker.totalSpent - costBefore;

            // Run verification pipeline on "verify" stages
            if (resolveAgentType(stage) === 'verify') {
              await this.runVerification(stage);
            }

            this.emit('stage:complete', {
              stageName: stage.name,
              model: resolvedModel,
              content: result.content,
              durationMs: result.durationMs,
              costUsd: stageCost,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
            });

            // post_stage hook (non-blocking)
            if (this.context.hookManager?.hasHooks('post_stage')) {
              this.context.hookManager.emit('post_stage', {
                stage_name: stage.name,
                skill_name: skill.name,
                tokens: result.inputTokens + result.outputTokens,
                cost: stageCost,
                duration_ms: result.durationMs,
              }).catch(() => {});
            }
          } else {
            // Error outcome
            this.emit('stage:error', { stageName: stage.name, error: outcome.error });
            failedStages.push(stage.name);

            if (outcome.fatal) {
              fatalController.abort();
            }
          }
        }
      }

      const isPartial = failedStages.length > 0 || skippedStages.length > 0;
      const completeEvent: PipelineCompleteEvent = {
        totalDurationMs: Date.now() - pipelineStart,
        totalCostUsd: this.costTracker.totalSpent,
        stagesCompleted,
        outputs: this.outputs,
        primaryOutput: this.stageOutputs.get(skill.output.primary) ?? '',
        verificationReport: this._verificationReport,
        ...(isPartial ? { partial: true, failedStages, skippedStages } : {}),
      };

      this.emit('pipeline:complete', completeEvent);

      // post_pipeline hook (non-blocking)
      if (this.context.hookManager?.hasHooks('post_pipeline')) {
        this.context.hookManager.emit('post_pipeline', {
          skill_name: skill.name,
          inputs: { ...inputs },
          total_cost_usd: completeEvent.totalCostUsd,
          total_duration_ms: completeEvent.totalDurationMs,
          stages_completed: completeEvent.stagesCompleted,
          primary_output: completeEvent.primaryOutput,
          summary: completeEvent.primaryOutput.slice(0, 500),
        }).catch(() => {});
      }

      return completeEvent;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('pipeline:error', { error, stageName: failedStages[failedStages.length - 1] });
      throw err;
    }
  }

  /**
   * Run a sub-pipeline for a stage that declares sub_pipeline.
   * Loads the referenced skill, resolves sub_inputs from parent context,
   * creates a nested PipelineEngine with shared budget, and forwards events.
   */
  private async runSubPipeline(
    stage: SkillStage,
    abortSignal: AbortSignal,
  ): Promise<import('./task-agent.js').TaskAgentOutcome> {
    if (this.depth >= MAX_SUB_PIPELINE_DEPTH) {
      return {
        status: 'error',
        error: new Error(`Sub-pipeline depth limit (${MAX_SUB_PIPELINE_DEPTH}) exceeded at stage "${stage.name}"`),
        fatal: true,
      };
    }

    const { loadSkill } = this.context;
    if (!loadSkill) {
      return {
        status: 'error',
        error: new Error(`No loadSkill function provided — cannot resolve sub_pipeline "${stage.sub_pipeline}"`),
        fatal: false,
      };
    }

    const entry = loadSkill(stage.sub_pipeline!);
    if (!entry) {
      return {
        status: 'error',
        error: new Error(`Sub-pipeline skill "${stage.sub_pipeline}" not found`),
        fatal: false,
      };
    }

    // Resolve sub_inputs: substitute variables from parent's inputs + stageOutputs
    const variableMap: Record<string, string | string[] | number | boolean> = {
      ...this.context.inputs,
    };
    for (const [name, output] of this.stageOutputs) {
      variableMap[name] = output;
    }

    const resolvedSubInputs: Record<string, string | string[] | number | boolean> = {};
    if (stage.sub_inputs) {
      for (const [key, template] of Object.entries(stage.sub_inputs)) {
        resolvedSubInputs[key] = substituteVariables(template, variableMap);
      }
    }

    const startTime = Date.now();

    const subContext: PipelineContext = {
      skill: entry.skill,
      inputs: resolvedSubInputs,
      modelOverride: this.context.modelOverride,
      maxBudgetUsd: this.context.maxBudgetUsd,
      providerConfig: this.context.providerConfig,
      resolveTools: this.context.resolveTools,
      isToolAvailable: this.context.isToolAvailable,
      toolsConfig: this.context.toolsConfig,
      abortSignal,
      maxConcurrency: this.context.maxConcurrency,
      agentConfig: this.context.agentConfig,
      loadSkill: this.context.loadSkill,
      sharedCostTracker: this.costTracker,
      hookManager: this.context.hookManager,
    };

    const subEngine = new PipelineEngine(subContext, this.depth + 1);

    // Forward sub-pipeline events with prefixed stage names
    const prefix = stage.name;
    subEngine.on('stage:start', (event) => {
      this.emit('stage:start', { ...event, stageName: `${prefix}/${event.stageName}` });
    });
    subEngine.on('stage:stream', (event) => {
      this.emit('stage:stream', { ...event, stageName: `${prefix}/${event.stageName}` });
    });
    subEngine.on('stage:complete', (event) => {
      this.emit('stage:complete', { ...event, stageName: `${prefix}/${event.stageName}` });
    });
    subEngine.on('stage:error', (event) => {
      this.emit('stage:error', { ...event, stageName: `${prefix}/${event.stageName}` });
    });
    subEngine.on('stage:tool-start', (event) => {
      this.emit('stage:tool-start', { ...event, stageName: `${prefix}/${event.stageName}` });
    });
    subEngine.on('stage:tool-end', (event) => {
      this.emit('stage:tool-end', { ...event, stageName: `${prefix}/${event.stageName}` });
    });

    try {
      const result = await subEngine.run();
      return {
        status: 'success',
        result: {
          stageName: stage.name,
          content: result.primaryOutput,
          durationMs: Date.now() - startTime,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        },
      };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
        fatal: false,
      };
    }
  }

  /** Check if a stage should be skipped because its dependencies failed. */
  private shouldSkipStage(stage: SkillStage, failedStages: string[]): boolean {
    if (!stage.input_from || stage.input_from.length === 0) return false;
    return stage.input_from.some(dep => failedStages.includes(dep));
  }

  /**
   * Validates that required tools are available and warns about missing optional tools.
   * Throws if any required tool is unavailable.
   */
  private validateToolAvailability(): void {
    const { skill, isToolAvailable } = this.context;
    if (!isToolAvailable) return;

    const required = skill.tools_required ?? [];
    const optional = skill.tools_optional ?? [];
    const missingRequired: string[] = [];

    for (const toolName of required) {
      if (!isToolAvailable(toolName)) {
        missingRequired.push(toolName);
        this.emit('tool:unavailable', { toolName, required: true });
      }
    }

    for (const toolName of optional) {
      if (!isToolAvailable(toolName)) {
        this.emit('tool:unavailable', { toolName, required: false });
      }
    }

    if (missingRequired.length > 0) {
      throw new Error(
        `Required tools unavailable: ${missingRequired.join(', ')}. ` +
        `Ensure the tools are configured and accessible.`,
      );
    }
  }

  /**
   * Run the verification pipeline (extract claims → link to sources → generate report).
   * Uses the verify stage's input_from stages as the analysis text and all prior
   * stage outputs as source data.
   */
  private async runVerification(stage: SkillStage): Promise<void> {
    const verifyStart = Date.now();

    try {
      // The analysis text comes from the stages that feed into the verify stage
      const inputStages = stage.input_from ?? [];
      const analysisTexts: string[] = [];
      for (const dep of inputStages) {
        const output = this.stageOutputs.get(dep);
        if (output) analysisTexts.push(output);
      }

      if (analysisTexts.length === 0) return;

      const analysisText = analysisTexts.join('\n\n');
      const { modelOverride, maxBudgetUsd } = this.context;
      const modelId = this.providers.remapModel(
        modelOverride ?? stage.model ?? 'claude-sonnet-4-20250514',
      );
      const model = this.providers.getModel(modelId);
      const budget = { maxCostUsd: maxBudgetUsd, tracker: this.costTracker };

      // Step 1: Extract claims from analysis text
      const extractResult = await extractClaims({
        analysisText,
        model,
        modelId,
        budget,
      });

      // Step 2: Link claims to source data from all prior stages
      const stageOutputs: Record<string, string> = {};
      for (const [name, output] of this.stageOutputs) {
        // Exclude the verify stage itself
        if (name !== stage.name) {
          stageOutputs[name] = output;
        }
      }

      const linkResult = linkClaims({
        claims: extractResult.claims,
        stageOutputs,
      });

      // Step 3: Generate report
      const report = generateReport({
        claims: linkResult.claims,
        analysisText,
      });

      this._verificationReport = report;

      this.emit('verification:complete', {
        report,
        stageName: stage.name,
        durationMs: Date.now() - verifyStart,
      });
    } catch {
      // Verification failures are non-fatal — the pipeline continues
      // The verify stage output itself (from the LLM) is still available
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Combine two optional AbortSignals into one. Either aborting triggers the combined signal.
 */
function combineAbortSignals(
  userSignal?: AbortSignal,
  fatalSignal?: AbortSignal,
): AbortSignal {
  if (!userSignal && !fatalSignal) {
    return new AbortController().signal;
  }
  if (!userSignal) return fatalSignal!;
  if (!fatalSignal) return userSignal;

  const controller = new AbortController();

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (userSignal.aborted || fatalSignal.aborted) {
    controller.abort();
    return controller.signal;
  }

  userSignal.addEventListener('abort', abort, { once: true });
  fatalSignal.addEventListener('abort', abort, { once: true });

  return controller.signal;
}
