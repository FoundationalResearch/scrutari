import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTaskAgent, type TaskAgentContext } from './task-agent.js';
import { AGENT_DEFAULTS } from './agent-types.js';

// Mock the router modules
vi.mock('../router/providers.js', () => ({
  ProviderRegistry: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
  })),
}));

vi.mock('../router/llm.js', () => ({
  streamLLM: vi.fn().mockImplementation(() => {
    const chunks = ['Hello', ' from', ' agent'];
    let index = 0;
    return {
      stream: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (index < chunks.length) {
                return { value: chunks[index++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      },
      response: Promise.resolve({
        content: 'Hello from agent',
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
      }),
    };
  }),
  callLLM: vi.fn().mockResolvedValue({
    content: 'Tool result',
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
  }),
}));

function makeMockCostTracker() {
  return {
    totalSpent: 0,
    totalCommitted: 0,
    totalCalls: 0,
    addCost: vi.fn(),
    checkBudget: vi.fn(),
    reserve: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
  } as unknown as TaskAgentContext['costTracker'];
}

async function makeMockProviders() {
  const { ProviderRegistry } = vi.mocked(await import('../router/providers.js'));
  return new ProviderRegistry({ providers: { anthropic: { apiKey: 'test' } } });
}

function makeContext(overrides: Partial<TaskAgentContext> & { providers: TaskAgentContext['providers'] }): TaskAgentContext {
  return {
    stage: { name: 'gather', prompt: 'Gather data for {ticker}' },
    modelId: 'claude-sonnet-4-20250514',
    agentDefaults: { ...AGENT_DEFAULTS.default },
    inputs: { ticker: 'NVDA' },
    priorOutputs: new Map(),
    costTracker: makeMockCostTracker(),
    maxBudgetUsd: 5.0,
    emit: vi.fn(),
    ...overrides,
  };
}

describe('runTaskAgent', () => {
  let providers: TaskAgentContext['providers'];

  beforeEach(async () => {
    vi.clearAllMocks();
    providers = await makeMockProviders();
  });

  it('returns success outcome for a streaming stage', async () => {
    const ctx = makeContext({ providers });
    const outcome = await runTaskAgent(ctx);

    expect(outcome.status).toBe('success');
    if (outcome.status === 'success') {
      expect(outcome.result.stageName).toBe('gather');
      expect(outcome.result.content).toBe('Hello from agent');
      expect(outcome.result.inputTokens).toBe(100);
      expect(outcome.result.outputTokens).toBe(50);
      expect(outcome.result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits stage:stream events', async () => {
    const emit = vi.fn();
    const ctx = makeContext({ providers, emit });
    await runTaskAgent(ctx);

    const streamEvents = emit.mock.calls.filter(([event]: [string]) => event === 'stage:stream');
    expect(streamEvents.length).toBeGreaterThanOrEqual(1);
    expect(streamEvents[0][1]).toHaveProperty('stageName', 'gather');
  });

  it('substitutes input variables in prompt', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const ctx = makeContext({
      providers,
      stage: { name: 'test', prompt: 'Analyze {ticker} stock' },
      inputs: { ticker: 'AAPL' },
    });
    await runTaskAgent(ctx);

    expect(streamLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ content: 'Analyze AAPL stock' }),
        ]),
      }),
    );
  });

  it('includes prior stage outputs in context', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const priorOutputs = new Map([['gather', 'Some gathered data']]);
    const ctx = makeContext({
      providers,
      stage: { name: 'analyze', prompt: 'Analyze data', input_from: ['gather'] },
      priorOutputs,
    });
    await runTaskAgent(ctx);

    const callArgs = streamLLM.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Output from "gather" stage');
    expect(callArgs.messages[0].content).toContain('Some gathered data');
  });

  it('returns error outcome on failure', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    streamLLM.mockImplementationOnce(() => ({
      stream: {
        [Symbol.asyncIterator]() {
          return {
            async next() { throw new Error('LLM failure'); },
          };
        },
      },
      response: (() => { const p = Promise.reject(new Error('LLM failure')); p.catch(() => {}); return p; })(),
    }));

    const ctx = makeContext({ providers });
    const outcome = await runTaskAgent(ctx);

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.message).toBe('LLM failure');
      expect(outcome.fatal).toBe(false);
    }
  });

  it('marks budget errors as fatal', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const budgetError = new Error('Budget exceeded');
    budgetError.name = 'BudgetExceededError';

    streamLLM.mockImplementationOnce(() => ({
      stream: {
        [Symbol.asyncIterator]() {
          return {
            async next() { throw budgetError; },
          };
        },
      },
      response: (() => { const p = Promise.reject(budgetError); p.catch(() => {}); return p; })(),
    }));

    const ctx = makeContext({ providers });
    const outcome = await runTaskAgent(ctx);

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.fatal).toBe(true);
    }
  });

  it('marks abort errors as fatal', async () => {
    const controller = new AbortController();
    controller.abort();

    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    streamLLM.mockImplementationOnce(() => ({
      stream: {
        [Symbol.asyncIterator]() {
          return {
            async next() { throw abortError; },
          };
        },
      },
      response: (() => { const p = Promise.reject(abortError); p.catch(() => {}); return p; })(),
    }));

    const ctx = makeContext({ providers, abortSignal: controller.signal });
    const outcome = await runTaskAgent(ctx);

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.fatal).toBe(true);
    }
  });

  it('passes maxToolSteps to callLLM when stage has tools', async () => {
    const { callLLM } = vi.mocked(await import('../router/llm.js'));
    const mockToolSet = { get_quote: { description: 'Get quote', execute: vi.fn() } };
    const ctx = makeContext({
      providers,
      stage: { name: 'gather', prompt: 'Gather data for {ticker}', tools: ['market-data'] },
      resolveTools: vi.fn().mockReturnValue(mockToolSet),
      agentDefaults: { model: 'test', maxTokens: 4096, temperature: 0, maxToolSteps: 5 },
    });
    await runTaskAgent(ctx);

    // Should use callLLM (not streamLLM) with maxToolSteps
    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        maxToolSteps: 5,
        tools: mockToolSet,
      }),
    );
  });

  it('uses agentDefaults for maxTokens and temperature', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const ctx = makeContext({
      providers,
      agentDefaults: { model: 'test', maxTokens: 2048, temperature: 0.5, maxToolSteps: 5 },
    });
    await runTaskAgent(ctx);

    expect(streamLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 2048,
        temperature: 0.5,
      }),
    );
  });

  it('stage-level max_tokens overrides agentDefaults', async () => {
    const { streamLLM } = vi.mocked(await import('../router/llm.js'));
    const ctx = makeContext({
      providers,
      stage: { name: 'test', prompt: 'test', max_tokens: 1024 },
      agentDefaults: { model: 'test', maxTokens: 4096, temperature: 0.3, maxToolSteps: 10 },
    });
    await runTaskAgent(ctx);

    expect(streamLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 1024,
      }),
    );
  });
});
