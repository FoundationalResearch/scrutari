import { EventEmitter } from 'eventemitter3';
import type { ToolSet } from 'ai';
import { CostTracker, BudgetExceededError } from '../router/cost.js';
import { ProviderRegistry, type ProviderConfig } from '../router/providers.js';
import { callLLM, streamLLM } from '../router/llm.js';
import { BudgetExceededRetryError } from '../router/retry.js';
import { topologicalSort, substituteVariables } from '../skills/loader.js';
import type { Skill, SkillStage } from '../skills/types.js';
import { extractClaims } from '../verification/extractor.js';
import { linkClaims } from '../verification/linker.js';
import { generateReport } from '../verification/reporter.js';
import type { VerificationReport } from '../verification/types.js';

// ---------------------------------------------------------------------------
// Pipeline event types
// ---------------------------------------------------------------------------

export interface StageStartEvent {
  stageName: string;
  model: string;
  stageIndex: number;
  totalStages: number;
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
}

// ---------------------------------------------------------------------------
// Pipeline engine
// ---------------------------------------------------------------------------

const MAX_TOOL_STEPS = 10;

export class PipelineEngine extends EventEmitter<PipelineEvents> {
  private readonly context: PipelineContext;
  private readonly costTracker = new CostTracker();
  private readonly providers: ProviderRegistry;
  private readonly stageOutputs = new Map<string, string>();
  private _verificationReport?: VerificationReport;

  constructor(context: PipelineContext) {
    super();
    this.context = context;
    this.providers = new ProviderRegistry(context.providerConfig);
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

    const executionOrder = topologicalSort(skill);
    const stageMap = new Map(skill.stages.map(s => [s.name, s]));
    const pipelineStart = Date.now();
    let stagesCompleted = 0;
    const failedStages: string[] = [];
    const skippedStages: string[] = [];

    try {
      for (let i = 0; i < executionOrder.length; i++) {
        const stageName = executionOrder[i];
        const stage = stageMap.get(stageName)!;

        // Check abort signal before each stage
        if (this.context.abortSignal?.aborted) {
          skippedStages.push(stageName);
          continue;
        }

        // Skip stages whose dependencies failed
        if (this.shouldSkipStage(stage, failedStages)) {
          skippedStages.push(stageName);
          this.emit('stage:error', {
            stageName,
            error: new Error(`Skipped: dependency stage(s) failed`),
          });
          continue;
        }

        const resolvedModel = modelOverride ?? stage.model ?? 'claude-sonnet-4-20250514';

        this.emit('stage:start', {
          stageName,
          model: resolvedModel,
          stageIndex: i,
          totalStages: executionOrder.length,
        });

        const stageStart = Date.now();
        const costBefore = this.costTracker.totalSpent;

        try {
          const result = await this.executeStage(stage, resolvedModel, inputs, maxBudgetUsd);
          const durationMs = Date.now() - stageStart;
          const stageCost = this.costTracker.totalSpent - costBefore;

          this.stageOutputs.set(stageName, result.content);
          stagesCompleted++;

          // Run verification pipeline on "verify" stages
          if (this.isVerifyStage(stage)) {
            await this.runVerification(stage);
          }

          this.emit('stage:complete', {
            stageName,
            model: resolvedModel,
            content: result.content,
            durationMs,
            costUsd: stageCost,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit('stage:error', { stageName, error });

          // Budget exceeded or abort — stop the pipeline, return partial results
          if (this.isFatalError(err)) {
            failedStages.push(stageName);
            // Mark remaining stages as skipped
            for (let j = i + 1; j < executionOrder.length; j++) {
              skippedStages.push(executionOrder[j]);
            }
            break;
          }

          // Non-fatal stage failure — record and continue
          failedStages.push(stageName);
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
      return completeEvent;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('pipeline:error', { error, stageName: failedStages[failedStages.length - 1] });
      throw err;
    }
  }

  /** Check if a stage should be skipped because its dependencies failed. */
  private shouldSkipStage(stage: SkillStage, failedStages: string[]): boolean {
    if (!stage.input_from || stage.input_from.length === 0) return false;
    return stage.input_from.some(dep => failedStages.includes(dep));
  }

  /** Check if an error should stop the entire pipeline. */
  private isFatalError(err: unknown): boolean {
    if (err instanceof BudgetExceededError) return true;
    if (err instanceof BudgetExceededRetryError) return true;
    if (err instanceof Error && err.name === 'BudgetExceededError') return true;
    if (err instanceof Error && err.name === 'BudgetExceededRetryError') return true;
    if (err instanceof Error && err.name === 'AbortError') return true;
    if (this.context.abortSignal?.aborted) return true;
    return false;
  }

  private async executeStage(
    stage: SkillStage,
    modelId: string,
    inputs: Record<string, string | string[] | number | boolean>,
    maxBudgetUsd: number,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    // Build variable map from inputs + prior stage outputs
    const variables: Record<string, string | string[] | number | boolean> = { ...inputs };
    if (stage.input_from) {
      for (const dep of stage.input_from) {
        const depOutput = this.stageOutputs.get(dep);
        if (depOutput) {
          variables[dep] = depOutput;
        }
      }
    }

    const prompt = substituteVariables(stage.prompt, variables);

    let systemPrompt = 'You are an expert financial analyst. Complete the following analysis task.';
    if (stage.output_format) {
      systemPrompt += ` Respond in ${stage.output_format} format.`;
    }

    // Include prior stage outputs as context
    const priorContext = this.buildPriorContext(stage);

    const model = this.providers.getModel(modelId);
    const budget = { maxCostUsd: maxBudgetUsd, tracker: this.costTracker };
    const messages = [
      ...(priorContext ? [{ role: 'user' as const, content: priorContext }] : []),
      { role: 'user' as const, content: prompt },
    ];

    // Resolve tools for this stage if available
    const stageTools = this.resolveStageTools(stage);
    const hasTools = stageTools !== undefined;

    if (hasTools) {
      // Stages with tools use non-streaming callLLM with tool call loop
      return this.executeWithTools(stage, modelId, model, systemPrompt, messages, stageTools, budget);
    }

    // Stages without tools use streaming
    const { stream, response } = streamLLM({
      model,
      modelId,
      system: systemPrompt,
      messages,
      maxOutputTokens: stage.max_tokens,
      temperature: stage.temperature,
      budget,
      abortSignal: this.context.abortSignal,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      fullContent += chunk;
      this.emit('stage:stream', { stageName: stage.name, chunk });
    }

    const llmResponse = await response;

    return {
      content: llmResponse.content || fullContent,
      inputTokens: llmResponse.usage.inputTokens,
      outputTokens: llmResponse.usage.outputTokens,
    };
  }

  private async executeWithTools(
    stage: SkillStage,
    modelId: string,
    model: ReturnType<ProviderRegistry['getModel']>,
    systemPrompt: string,
    messages: Array<{ role: 'user'; content: string }>,
    tools: ToolSet,
    budget: { maxCostUsd: number; tracker: CostTracker },
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const conversationMessages = [...messages] as Array<{ role: string; content: string }>;
    let finalContent = '';

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const response = await callLLM({
        model,
        modelId,
        system: systemPrompt,
        messages: conversationMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
        tools,
        maxOutputTokens: stage.max_tokens,
        temperature: stage.temperature,
        budget,
        abortSignal: this.context.abortSignal,
      });

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      // If no tool calls, we have the final text response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalContent = response.content;
        this.emit('stage:stream', { stageName: stage.name, chunk: response.content });
        break;
      }

      // Process tool calls — the AI SDK auto-executes tools when they have execute()
      // functions, so response.content will contain the final text after tool execution.
      // However, if the model returned tool calls in its response, it means it wants
      // to use tools. With AI SDK's generateText and tools that have execute(),
      // the tool calls are already executed and results incorporated.
      // The response.content is the final text after all tool rounds.
      finalContent = response.content;
      if (finalContent) {
        this.emit('stage:stream', { stageName: stage.name, chunk: finalContent });
        break;
      }

      // If no content yet after tool calls, add tool results to conversation for next round
      const toolResultSummary = response.toolCalls
        .map(tc => `[Tool ${tc.toolName}: called with ${JSON.stringify(tc.input)}]`)
        .join('\n');
      conversationMessages.push({ role: 'assistant', content: toolResultSummary });
      conversationMessages.push({
        role: 'user',
        content: 'Continue with the analysis based on the tool results above.',
      });

      this.emit('stage:stream', {
        stageName: stage.name,
        chunk: `\n[Using tools: ${response.toolCalls.map(tc => tc.toolName).join(', ')}]\n`,
      });
    }

    return {
      content: finalContent,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  }

  private resolveStageTools(stage: SkillStage): ToolSet | undefined {
    if (!stage.tools || stage.tools.length === 0 || !this.context.resolveTools) {
      return undefined;
    }
    const toolMap = this.context.resolveTools(stage.tools);
    if (Object.keys(toolMap).length === 0) return undefined;
    return toolMap as ToolSet;
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
   * Detect whether a stage is a verification stage.
   * A stage is a verify stage if its name is "verify" or contains "verify".
   */
  private isVerifyStage(stage: SkillStage): boolean {
    return stage.name === 'verify' || stage.name.includes('verify');
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
      const modelId = modelOverride ?? stage.model ?? 'claude-sonnet-4-20250514';
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

  private buildPriorContext(stage: SkillStage): string {
    if (!stage.input_from || stage.input_from.length === 0) return '';

    const parts: string[] = [];
    for (const dep of stage.input_from) {
      const output = this.stageOutputs.get(dep);
      if (output) {
        parts.push(`--- Output from "${dep}" stage ---\n${output}`);
      }
    }
    return parts.join('\n\n');
  }
}
