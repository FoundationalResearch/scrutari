import { generateText, streamText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { calculateCost, CostTracker, BudgetExceededError } from './cost.js';
import { withRetry, type RetryConfig, BudgetExceededRetryError } from './retry.js';

export interface LLMCallOptions {
  /** Resolved AI SDK LanguageModel instance. */
  model: LanguageModel;
  /** Raw model-id string (for cost look-up). */
  modelId: string;
  /** System prompt. */
  system: string;
  /** Conversation messages. */
  messages: ModelMessage[];
  /** AI SDK tool definitions. */
  tools?: ToolSet;
  maxOutputTokens?: number;
  temperature?: number;
  /** Optional budget enforcement. */
  budget?: { maxCostUsd: number; tracker: CostTracker };
  /** Retry configuration (uses defaults if not provided). */
  retry?: RetryConfig;
  /** Abort signal for cancellation. */
  abortSignal?: AbortSignal;
  /** Maximum number of tool-use steps for multi-step agent loops. */
  maxToolSteps?: number;
}

export interface LLMToolCall {
  toolName: string;
  input: unknown;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  /** Number of attempts made (1 = no retries needed). */
  attempts?: number;
}

export interface LLMStreamResult {
  /** Async iterable of text chunks. */
  stream: AsyncIterable<string>;
  /** Resolves after the stream finishes with the full response + usage. */
  response: Promise<LLMResponse>;
}

const DEFAULT_LLM_RETRY: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  timeoutMs: 60000,
  retryOn: ['rate_limit', 'server_error', 'timeout'],
};

/**
 * Single-shot LLM call (non-streaming) with retry support.
 * Retries on 429 (rate limit), 5xx (server errors), and timeouts.
 * Does NOT retry on budget exceeded or auth errors.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const retryConfig = { ...DEFAULT_LLM_RETRY, ...options.retry, abortSignal: options.abortSignal };

  const { result, attempts } = await withRetry(
    async () => {
      // Budget check before each attempt
      if (options.budget) {
        try {
          options.budget.tracker.checkBudget(options.budget.maxCostUsd);
        } catch (err) {
          // Wrap in non-retryable error
          throw new BudgetExceededRetryError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      const useMultiStep = options.tools && options.maxToolSteps && options.maxToolSteps > 1;

      const result = await generateText({
        model: options.model,
        system: options.system,
        messages: options.messages,
        tools: options.tools,
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        abortSignal: options.abortSignal,
        ...(useMultiStep ? { stopWhen: stepCountIs(options.maxToolSteps!) } : {}),
      });

      // Use totalUsage for multi-step (aggregates across all steps)
      const usage = useMultiStep ? result.totalUsage : result.usage;
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const costUsd = calculateCost(options.modelId, inputTokens, outputTokens);

      if (options.budget) {
        options.budget.tracker.addCost(costUsd);
        try {
          options.budget.tracker.checkBudget(options.budget.maxCostUsd);
        } catch (err) {
          throw new BudgetExceededRetryError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      const toolCalls = result.toolCalls?.map(tc => ({
        toolName: tc.toolName,
        input: tc.input,
      }));

      return {
        content: result.text,
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        usage: { inputTokens, outputTokens, costUsd },
      };
    },
    retryConfig,
  );

  return { ...result, attempts };
}

/**
 * Streaming LLM call with retry on the response promise.
 *
 * Note: The stream itself is not retried (it starts immediately).
 * If the stream fails due to a retryable error, the response promise
 * will reject with an error the caller can handle.
 */
export function streamLLM(options: LLMCallOptions): LLMStreamResult {
  if (options.budget) {
    options.budget.tracker.checkBudget(options.budget.maxCostUsd);
  }

  const result = streamText({
    model: options.model,
    system: options.system,
    messages: options.messages,
    tools: options.tools,
    maxOutputTokens: options.maxOutputTokens,
    temperature: options.temperature,
    abortSignal: options.abortSignal,
  });

  const response = (async (): Promise<LLMResponse> => {
    const fullText = await result.text;
    const usage = await result.usage;
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const costUsd = calculateCost(options.modelId, inputTokens, outputTokens);

    if (options.budget) {
      options.budget.tracker.addCost(costUsd);
      options.budget.tracker.checkBudget(options.budget.maxCostUsd);
    }

    return {
      content: fullText,
      usage: { inputTokens, outputTokens, costUsd },
    };
  })();

  return {
    stream: result.textStream,
    response,
  };
}

/**
 * Call LLM with JSON output retry.
 *
 * If the response doesn't parse as valid JSON and the stage expects JSON output,
 * retries once with the parse error appended to the prompt.
 */
export async function callLLMWithJsonRetry(
  options: LLMCallOptions,
  validateJson?: (content: string) => boolean,
): Promise<LLMResponse> {
  const response = await callLLM(options);

  // If no JSON validation needed, return as-is
  if (!validateJson) return response;

  // Try to validate the response as JSON
  if (validateJson(response.content)) return response;

  // JSON parse failed — retry once with error context appended
  const retryMessages = [
    ...options.messages,
    {
      role: 'assistant' as const,
      content: response.content,
    },
    {
      role: 'user' as const,
      content: 'Your previous response was not valid JSON. Please respond with only valid JSON, no other text or markdown formatting.',
    },
  ];

  return callLLM({
    ...options,
    messages: retryMessages,
    retry: { maxRetries: 0 }, // No further retries on the JSON fix attempt
  });
}

export { BudgetExceededError };

// Re-export retry utilities for convenience
export {
  classifyError,
  type ErrorCategory,
  type RetryConfig,
  withRetry,
} from './retry.js';
