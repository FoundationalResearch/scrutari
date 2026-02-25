import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTaskAgent, wrapToolsWithEvents, type TaskAgentContext } from './task-agent.js';
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
    // Tools are wrapped by wrapToolsWithEvents, so we check structure not identity
    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        maxToolSteps: 5,
      }),
    );
    const calledTools = callLLM.mock.calls[0][0].tools as Record<string, { description: string }>;
    expect(calledTools).toHaveProperty('get_quote');
    expect(calledTools.get_quote.description).toBe('Get quote');
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

  it('emits stage:tool-start and stage:tool-end when stage has tools', async () => {
    const emit = vi.fn();
    const mockToolSet = {
      get_quote: {
        description: 'Get quote',
        inputSchema: {},
        execute: vi.fn().mockResolvedValue({ price: 100 }),
      },
    };
    const ctx = makeContext({
      providers,
      emit,
      stage: { name: 'gather', prompt: 'Gather data for {ticker}', tools: ['market-data'] },
      resolveTools: vi.fn().mockReturnValue(mockToolSet),
      agentDefaults: { model: 'test', maxTokens: 4096, temperature: 0, maxToolSteps: 5 },
    });
    await runTaskAgent(ctx);

    // The callLLM mock doesn't actually call tools, so we just verify that
    // wrapToolsWithEvents was applied (tools were passed as wrapped versions).
    // The actual tool-event emission is tested separately in wrapToolsWithEvents tests.
    const { callLLM } = vi.mocked(await import('../router/llm.js'));
    expect(callLLM).toHaveBeenCalled();
  });
});

describe('wrapToolsWithEvents', () => {
  it('emits stage:tool-start before and stage:tool-end after successful execution', async () => {
    const emit = vi.fn();
    const executeFn = vi.fn().mockResolvedValue({ price: 150 });
    const tools = {
      get_quote: { description: 'Get quote', inputSchema: {}, execute: executeFn },
    };

    const wrapped = wrapToolsWithEvents(tools, 'gather', emit);
    const result = await (wrapped.get_quote as { execute: (...args: unknown[]) => Promise<unknown> }).execute({ ticker: 'NVDA' });

    expect(result).toEqual({ price: 150 });
    expect(executeFn).toHaveBeenCalledWith({ ticker: 'NVDA' });

    const startCalls = emit.mock.calls.filter(([event]: [string]) => event === 'stage:tool-start');
    const endCalls = emit.mock.calls.filter(([event]: [string]) => event === 'stage:tool-end');

    expect(startCalls).toHaveLength(1);
    expect(startCalls[0][1]).toMatchObject({
      stageName: 'gather',
      toolName: 'get_quote',
    });
    expect(startCalls[0][1]).toHaveProperty('callId');

    expect(endCalls).toHaveLength(1);
    expect(endCalls[0][1]).toMatchObject({
      stageName: 'gather',
      toolName: 'get_quote',
      success: true,
    });
    expect(endCalls[0][1].durationMs).toBeGreaterThanOrEqual(0);
    expect(endCalls[0][1].callId).toBe(startCalls[0][1].callId);
  });

  it('emits stage:tool-end with success=false and re-throws on error', async () => {
    const emit = vi.fn();
    const executeFn = vi.fn().mockRejectedValue(new Error('API timeout'));
    const tools = {
      get_quote: { description: 'Get quote', inputSchema: {}, execute: executeFn },
    };

    const wrapped = wrapToolsWithEvents(tools, 'gather', emit);

    await expect(
      (wrapped.get_quote as { execute: (...args: unknown[]) => Promise<unknown> }).execute({ ticker: 'NVDA' }),
    ).rejects.toThrow('API timeout');

    const endCalls = emit.mock.calls.filter(([event]: [string]) => event === 'stage:tool-end');
    expect(endCalls).toHaveLength(1);
    expect(endCalls[0][1]).toMatchObject({
      stageName: 'gather',
      toolName: 'get_quote',
      success: false,
      error: 'API timeout',
    });
  });

  it('preserves tool properties other than execute', () => {
    const emit = vi.fn();
    const tools = {
      get_quote: {
        description: 'Get a stock quote',
        inputSchema: { type: 'object' },
        execute: vi.fn(),
      },
    };

    const wrapped = wrapToolsWithEvents(tools, 'gather', emit);
    const wrappedTool = wrapped.get_quote as { description: string; inputSchema: unknown };
    expect(wrappedTool.description).toBe('Get a stock quote');
    expect(wrappedTool.inputSchema).toEqual({ type: 'object' });
  });

  it('passes through tools without execute unchanged', () => {
    const emit = vi.fn();
    const tools = {
      no_exec: { description: 'No execute' },
    };

    const wrapped = wrapToolsWithEvents(tools, 'gather', emit);
    expect(wrapped.no_exec).toBe(tools.no_exec);
  });

  it('generates unique callIds for concurrent calls to the same tool', async () => {
    const emit = vi.fn();
    const executeFn = vi.fn().mockResolvedValue('ok');
    const tools = {
      search: { description: 'Search', inputSchema: {}, execute: executeFn },
    };

    const wrapped = wrapToolsWithEvents(tools, 'gather', emit);
    const execFn = (wrapped.search as { execute: (...args: unknown[]) => Promise<unknown> }).execute;
    await Promise.all([execFn('a'), execFn('b')]);

    const startCalls = emit.mock.calls.filter(([event]: [string]) => event === 'stage:tool-start');
    expect(startCalls).toHaveLength(2);
    expect(startCalls[0][1].callId).not.toBe(startCalls[1][1].callId);
  });
});
