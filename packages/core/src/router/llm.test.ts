import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLLM, streamLLM, BudgetExceededError, type LLMCallOptions } from './llm.js';
import { BudgetExceededRetryError } from './retry.js';
import { CostTracker } from './cost.js';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

import { generateText, streamText } from 'ai';

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeMockModel() {
  return {
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    specificationVersion: 'v1' as const,
  } as unknown as LLMCallOptions['model'];
}

function makeBaseOptions(overrides?: Partial<LLMCallOptions>): LLMCallOptions {
  return {
    model: makeMockModel(),
    modelId: 'claude-sonnet-4-20250514',
    system: 'You are an analyst.',
    messages: [{ role: 'user' as const, content: 'Analyze AAPL' }],
    ...overrides,
  };
}

describe('callLLM', () => {
  it('calls generateText and returns formatted response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'AAPL analysis result',
      toolCalls: [],
      usage: {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    } as any);

    const result = await callLLM(makeBaseOptions());

    expect(result.content).toBe('AAPL analysis result');
    expect(result.toolCalls).toBeUndefined();
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(200);
    // Cost: (100 * 3 + 200 * 15) / 1M = 0.0033
    expect(result.usage.costUsd).toBeCloseTo(0.0033, 6);
  });

  it('passes through tool calls', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '',
      toolCalls: [
        { toolName: 'getPrice', input: { ticker: 'AAPL' } },
      ],
      usage: {
        inputTokens: 50,
        outputTokens: 30,
        totalTokens: 80,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    } as any);

    const result = await callLLM(makeBaseOptions());

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].toolName).toBe('getPrice');
    expect(result.toolCalls![0].input).toEqual({ ticker: 'AAPL' });
  });

  it('tracks cost on the budget tracker', async () => {
    const tracker = new CostTracker();

    mockGenerateText.mockResolvedValueOnce({
      text: 'result',
      toolCalls: [],
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    } as any);

    await callLLM(makeBaseOptions({
      budget: { maxCostUsd: 5.0, tracker },
    }));

    expect(tracker.totalSpent).toBeGreaterThan(0);
    expect(tracker.totalCalls).toBe(1);
  });

  it('throws BudgetExceededRetryError before call if already over budget', async () => {
    const tracker = new CostTracker();
    tracker.addCost(5.0);

    await expect(
      callLLM(makeBaseOptions({
        budget: { maxCostUsd: 5.0, tracker },
      })),
    ).rejects.toThrow(BudgetExceededRetryError);

    // generateText should not have been called
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('throws BudgetExceededRetryError after call if cost exceeds budget', async () => {
    const tracker = new CostTracker();
    tracker.addCost(4.99);

    mockGenerateText.mockResolvedValueOnce({
      text: 'result',
      toolCalls: [],
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    } as any);

    await expect(
      callLLM(makeBaseOptions({
        budget: { maxCostUsd: 5.0, tracker },
      })),
    ).rejects.toThrow(BudgetExceededRetryError);
  });

  it('handles undefined token counts gracefully', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'result',
      toolCalls: [],
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    } as any);

    const result = await callLLM(makeBaseOptions());

    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.costUsd).toBe(0);
  });
});

describe('streamLLM', () => {
  it('returns stream and response promise', async () => {
    const chunks = ['Hello', ' ', 'world'];
    const mockTextStream = (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })();

    mockStreamText.mockReturnValueOnce({
      textStream: mockTextStream,
      text: Promise.resolve('Hello world'),
      usage: Promise.resolve({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      }),
    } as any);

    const { stream, response } = streamLLM(makeBaseOptions());

    // Consume the stream
    const collected: string[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected).toEqual(chunks);

    // Get the final response
    const result = await response;
    expect(result.content).toBe('Hello world');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it('throws BudgetExceededError before streaming if already over budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(5.0);

    expect(() =>
      streamLLM(makeBaseOptions({
        budget: { maxCostUsd: 5.0, tracker },
      })),
    ).toThrow(BudgetExceededError);
  });
});
