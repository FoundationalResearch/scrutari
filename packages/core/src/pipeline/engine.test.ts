import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineEngine, type PipelineContext } from './engine.js';

// Mock the router modules
vi.mock('../router/providers.js', () => ({
  ProviderRegistry: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
  })),
}));

vi.mock('../router/llm.js', () => ({
  streamLLM: vi.fn().mockImplementation((_options: unknown) => {
    const chunks = ['Hello', ' from', ' stage'];
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
        content: 'Hello from stage',
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
      }),
    };
  }),
  callLLM: vi.fn().mockResolvedValue({
    content: 'Hello from stage',
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
  }),
}));

vi.mock('../verification/extractor.js', () => ({
  extractClaims: vi.fn().mockResolvedValue({
    claims: [
      {
        id: 'claim-1',
        text: 'Revenue was $50 billion',
        category: 'metric',
        status: 'unverified',
        confidence: 0,
        sources: [],
        value: 50,
        unit: 'billion',
      },
    ],
  }),
}));

vi.mock('../verification/linker.js', () => ({
  linkClaims: vi.fn().mockImplementation(({ claims }: { claims: unknown[] }) => ({
    claims: (claims as Array<Record<string, unknown>>).map(c => ({
      ...c,
      status: 'verified',
      confidence: 0.9,
      sources: [{ sourceId: 'stage:analyze', label: 'analyze stage output', stage: 'analyze', excerpt: 'Revenue data' }],
    })),
    linked: claims.length,
  })),
}));

vi.mock('../verification/reporter.js', () => ({
  generateReport: vi.fn().mockImplementation(({ claims, analysisText }: { claims: unknown[]; analysisText: string }) => ({
    claims,
    summary: {
      totalClaims: claims.length,
      verified: claims.length,
      unverified: 0,
      disputed: 0,
      errors: 0,
      overallConfidence: 0.9,
    },
    analysisText,
    annotatedText: analysisText,
    footnotes: {},
  })),
}));

vi.mock('../router/cost.js', () => ({
  CostTracker: vi.fn().mockImplementation(() => ({
    totalSpent: 0,
    totalCommitted: 0,
    checkBudget: vi.fn(),
    addCost: vi.fn(),
    reserve: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
  })),
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(spent: number, budget: number) {
      super(`Budget exceeded: spent $${spent.toFixed(4)} of $${budget.toFixed(2)} budget`);
      this.name = 'BudgetExceededError';
    }
  },
  calculateCost: vi.fn().mockReturnValue(0.01),
}));

vi.mock('../router/retry.js', () => ({
  BudgetExceededRetryError: class BudgetExceededRetryError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BudgetExceededRetryError';
    }
  },
}));

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    skill: {
      name: 'test-skill',
      description: 'A test skill',
      stages: [
        { name: 'gather', prompt: 'Gather data for {ticker}' },
        { name: 'analyze', prompt: 'Analyze the data', input_from: ['gather'] },
      ],
      output: { primary: 'analyze' },
    },
    inputs: { ticker: 'NVDA' },
    maxBudgetUsd: 5.0,
    providerConfig: {
      providers: {
        anthropic: { apiKey: 'test-key' },
      },
    },
    ...overrides,
  };
}

describe('PipelineEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates engine with context', () => {
    const engine = new PipelineEngine(makeContext());
    expect(engine).toBeDefined();
    expect(engine.totalCost).toBe(0);
  });

  it('emits stage:start events in topological order', async () => {
    const engine = new PipelineEngine(makeContext());
    const stageStarts: string[] = [];

    engine.on('stage:start', (event) => {
      stageStarts.push(event.stageName);
    });

    await engine.run();
    expect(stageStarts).toEqual(['gather', 'analyze']);
  });

  it('emits stage:stream events during execution', async () => {
    const engine = new PipelineEngine(makeContext());
    const chunks: string[] = [];

    engine.on('stage:stream', (event) => {
      chunks.push(event.chunk);
    });

    await engine.run();
    // 3 chunks per stage * 2 stages = 6
    expect(chunks.length).toBe(6);
  });

  it('emits stage:complete events with duration', async () => {
    const engine = new PipelineEngine(makeContext());
    const completions: string[] = [];

    engine.on('stage:complete', (event) => {
      completions.push(event.stageName);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(event.model).toBeDefined();
    });

    await engine.run();
    expect(completions).toEqual(['gather', 'analyze']);
  });

  it('emits pipeline:complete with results', async () => {
    const engine = new PipelineEngine(makeContext());
    const result = await engine.run();

    expect(result.stagesCompleted).toBe(2);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.outputs).toHaveProperty('gather');
    expect(result.outputs).toHaveProperty('analyze');
    expect(result.primaryOutput).toBeDefined();
  });

  it('stores stage outputs accessible via outputs getter', async () => {
    const engine = new PipelineEngine(makeContext());
    await engine.run();

    const outputs = engine.outputs;
    expect(outputs['gather']).toBe('Hello from stage');
    expect(outputs['analyze']).toBe('Hello from stage');
  });

  it('respects model override from context', async () => {
    const engine = new PipelineEngine(makeContext({ modelOverride: 'claude-haiku-3-5-20241022' }));
    const models: string[] = [];

    engine.on('stage:start', (event) => {
      models.push(event.model);
    });

    await engine.run();
    expect(models).toEqual(['claude-haiku-3-5-20241022', 'claude-haiku-3-5-20241022']);
  });

  it('uses per-stage model from skill when no override', async () => {
    const ctx = makeContext();
    ctx.skill.stages[0].model = 'claude-haiku-3-5-20241022';
    ctx.skill.stages[1].model = 'claude-sonnet-4-20250514';

    const engine = new PipelineEngine(ctx);
    const models: string[] = [];

    engine.on('stage:start', (event) => {
      models.push(event.model);
    });

    await engine.run();
    expect(models).toEqual(['claude-haiku-3-5-20241022', 'claude-sonnet-4-20250514']);
  });

  it('handles single-stage skills', async () => {
    const ctx = makeContext({
      skill: {
        name: 'simple',
        description: 'Simple skill',
        stages: [{ name: 'only', prompt: 'Do it' }],
        output: { primary: 'only' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(1);
  });

  // --- Tool availability validation ---

  it('throws when required tools are unavailable', async () => {
    const ctx = makeContext({
      skill: {
        name: 'tool-skill',
        description: 'Skill with tools',
        tools_required: ['edgar', 'bloomberg'],
        stages: [{ name: 's1', prompt: 'test', tools: ['edgar', 'bloomberg'] }],
        output: { primary: 's1' },
      },
      isToolAvailable: (name: string) => name === 'edgar', // bloomberg not available
    });

    const engine = new PipelineEngine(ctx);
    await expect(engine.run()).rejects.toThrow('Required tools unavailable: bloomberg');
  });

  it('emits tool:unavailable for missing optional tools but continues', async () => {
    const ctx = makeContext({
      skill: {
        name: 'tool-skill',
        description: 'Skill with optional tools',
        tools_optional: ['news', 'bloomberg'],
        stages: [{ name: 's1', prompt: 'test' }],
        output: { primary: 's1' },
      },
      isToolAvailable: (name: string) => name === 'news', // bloomberg not available
    });

    const engine = new PipelineEngine(ctx);
    const warnings: Array<{ toolName: string; required: boolean }> = [];
    engine.on('tool:unavailable', (event) => warnings.push(event));

    await engine.run();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({ toolName: 'bloomberg', required: false });
  });

  it('passes when all required tools are available', async () => {
    const ctx = makeContext({
      skill: {
        name: 'tool-skill',
        description: 'Skill with tools',
        tools_required: ['edgar', 'market-data'],
        stages: [{ name: 's1', prompt: 'test' }],
        output: { primary: 's1' },
      },
      isToolAvailable: () => true,
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(1);
  });

  it('skips validation when no isToolAvailable checker provided', async () => {
    const ctx = makeContext({
      skill: {
        name: 'tool-skill',
        description: 'Skill with tools',
        tools_required: ['anything'],
        stages: [{ name: 's1', prompt: 'test' }],
        output: { primary: 's1' },
      },
      // No isToolAvailable provided — should not fail
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(1);
  });

  it('passes toolsConfig through context', () => {
    const ctx = makeContext({
      toolsConfig: {
        'sec-edgar': { user_agent_email: 'test@example.com' },
      },
    });

    const engine = new PipelineEngine(ctx);
    // Just verify it doesn't crash - toolsConfig is carried through context
    expect(engine).toBeDefined();
  });

  // --- Verification integration ---

  it('runs verification on verify stages', async () => {
    const ctx = makeContext({
      skill: {
        name: 'verify-skill',
        description: 'Skill with verify stage',
        stages: [
          { name: 'analyze', prompt: 'Analyze {ticker}' },
          { name: 'verify', prompt: 'Verify the analysis', input_from: ['analyze'], output_format: 'json' as const },
        ],
        output: { primary: 'verify' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const verifyEvents: Array<{ stageName: string }> = [];
    engine.on('verification:complete', (event) => {
      verifyEvents.push({ stageName: event.stageName });
    });

    const result = await engine.run();
    expect(result.stagesCompleted).toBe(2);
    expect(verifyEvents).toHaveLength(1);
    expect(verifyEvents[0].stageName).toBe('verify');
    expect(result.verificationReport).toBeDefined();
    expect(result.verificationReport!.summary.totalClaims).toBeGreaterThanOrEqual(0);
  });

  it('exposes verificationReport getter after run', async () => {
    const ctx = makeContext({
      skill: {
        name: 'verify-skill',
        description: 'Skill with verify stage',
        stages: [
          { name: 'analyze', prompt: 'Analyze' },
          { name: 'verify', prompt: 'Verify', input_from: ['analyze'] },
        ],
        output: { primary: 'verify' },
      },
    });

    const engine = new PipelineEngine(ctx);
    await engine.run();
    expect(engine.verificationReport).toBeDefined();
    expect(engine.verificationReport!.claims).toHaveLength(1);
  });

  it('does not run verification on non-verify stages', async () => {
    const ctx = makeContext({
      skill: {
        name: 'no-verify',
        description: 'Skill without verify stage',
        stages: [
          { name: 'analyze', prompt: 'Analyze' },
          { name: 'summarize', prompt: 'Summarize', input_from: ['analyze'] },
        ],
        output: { primary: 'summarize' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const verifyEvents: unknown[] = [];
    engine.on('verification:complete', (event) => verifyEvents.push(event));

    await engine.run();
    expect(verifyEvents).toHaveLength(0);
    expect(engine.verificationReport).toBeUndefined();
  });

  // --- Pipeline resilience ---

  it('returns partial results when a stage fails non-fatally', async () => {
    const { streamLLM } = await import('../router/llm.js');
    const mockStreamLLM = vi.mocked(streamLLM);

    // First stage succeeds, second stage fails
    mockStreamLLM
      .mockImplementationOnce(() => ({
        stream: {
          [Symbol.asyncIterator]() {
            let done = false;
            return {
              async next() {
                if (!done) { done = true; return { value: 'gather output', done: false }; }
                return { value: undefined, done: true };
              },
            };
          },
        },
        response: Promise.resolve({
          content: 'gather output',
          usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
        }),
      }))
      .mockImplementationOnce(() => ({
        stream: {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                throw new Error('LLM call failed');
              },
            };
          },
        },
        response: (() => { const p = Promise.reject(new Error('LLM call failed')); p.catch(() => {}); return p; })(),
      }));

    const engine = new PipelineEngine(makeContext());
    const result = await engine.run();

    expect(result.partial).toBe(true);
    expect(result.failedStages).toContain('analyze');
    expect(result.stagesCompleted).toBe(1);
    expect(result.outputs['gather']).toBe('gather output');
  });

  it('skips downstream stages when dependency fails', async () => {
    const ctx = makeContext({
      skill: {
        name: 'chain',
        description: 'Chain skill',
        stages: [
          { name: 'gather', prompt: 'Gather' },
          { name: 'analyze', prompt: 'Analyze', input_from: ['gather'] },
          { name: 'format', prompt: 'Format', input_from: ['analyze'] },
        ],
        output: { primary: 'format' },
      },
    });

    const { streamLLM } = await import('../router/llm.js');
    const mockStreamLLM = vi.mocked(streamLLM);

    // gather succeeds, analyze fails
    mockStreamLLM
      .mockImplementationOnce(() => ({
        stream: {
          [Symbol.asyncIterator]() {
            let done = false;
            return {
              async next() {
                if (!done) { done = true; return { value: 'data', done: false }; }
                return { value: undefined, done: true };
              },
            };
          },
        },
        response: Promise.resolve({
          content: 'data',
          usage: { inputTokens: 50, outputTokens: 25, costUsd: 0.005 },
        }),
      }))
      .mockImplementationOnce(() => ({
        stream: {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                throw new Error('Model error');
              },
            };
          },
        },
        response: (() => { const p = Promise.reject(new Error('Model error')); p.catch(() => {}); return p; })(),
      }));

    const engine = new PipelineEngine(ctx);
    const errors: string[] = [];
    engine.on('stage:error', (event) => errors.push(event.stageName));

    const result = await engine.run();

    expect(result.partial).toBe(true);
    expect(result.failedStages).toContain('analyze');
    expect(result.skippedStages).toContain('format');
    expect(result.stagesCompleted).toBe(1);
    expect(errors).toContain('analyze');
    expect(errors).toContain('format');
  });

  it('stops pipeline on abort signal', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const ctx = makeContext({ abortSignal: controller.signal });
    const engine = new PipelineEngine(ctx);
    const result = await engine.run();

    expect(result.stagesCompleted).toBe(0);
    expect(result.partial).toBe(true);
    expect(result.skippedStages).toEqual(['gather', 'analyze']);
  });

  it('stops pipeline on budget exceeded error', async () => {
    const { streamLLM } = await import('../router/llm.js');
    const mockStreamLLM = vi.mocked(streamLLM);
    const { BudgetExceededError: MockBudgetExceededError } = await import('../router/cost.js');

    mockStreamLLM.mockImplementationOnce(() => ({
      stream: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              throw new MockBudgetExceededError(5.1, 5.0);
            },
          };
        },
      },
      response: (() => { const p = Promise.reject(new MockBudgetExceededError(5.1, 5.0)); p.catch(() => {}); return p; })(),
    }));

    const engine = new PipelineEngine(makeContext());
    const result = await engine.run();

    expect(result.partial).toBe(true);
    expect(result.failedStages).toContain('gather');
    expect(result.skippedStages).toContain('analyze');
    expect(result.stagesCompleted).toBe(0);
  });

  it('emits pipeline:complete even on partial results', async () => {
    const controller = new AbortController();
    controller.abort();

    const ctx = makeContext({ abortSignal: controller.signal });
    const engine = new PipelineEngine(ctx);

    let completeEvent: Record<string, unknown> | undefined;
    engine.on('pipeline:complete', (event) => {
      completeEvent = event as unknown as Record<string, unknown>;
    });

    await engine.run();
    expect(completeEvent).toBeDefined();
    expect(completeEvent!['partial']).toBe(true);
  });

  // --- Parallel execution ---

  it('runs independent stages in the same level concurrently', async () => {
    const ctx = makeContext({
      skill: {
        name: 'parallel-skill',
        description: 'Skill with parallel stages',
        stages: [
          { name: 'gather_a', prompt: 'Gather A' },
          { name: 'gather_b', prompt: 'Gather B' },
          { name: 'merge', prompt: 'Merge', input_from: ['gather_a', 'gather_b'] },
        ],
        output: { primary: 'merge' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const stageStarts: string[] = [];
    const stageCompletes: string[] = [];

    engine.on('stage:start', (event) => stageStarts.push(event.stageName));
    engine.on('stage:complete', (event) => stageCompletes.push(event.stageName));

    const result = await engine.run();

    expect(result.stagesCompleted).toBe(3);
    // All 3 stages should start and complete
    expect(stageStarts).toContain('gather_a');
    expect(stageStarts).toContain('gather_b');
    expect(stageStarts).toContain('merge');
    // gather_a and gather_b should both start before merge starts
    expect(stageStarts.indexOf('gather_a')).toBeLessThan(stageStarts.indexOf('merge'));
    expect(stageStarts.indexOf('gather_b')).toBeLessThan(stageStarts.indexOf('merge'));
    // merge should complete after both gather stages complete
    expect(stageCompletes.indexOf('gather_a')).toBeLessThan(stageCompletes.indexOf('merge'));
    expect(stageCompletes.indexOf('gather_b')).toBeLessThan(stageCompletes.indexOf('merge'));
    // All outputs should be present
    expect(result.outputs).toHaveProperty('gather_a');
    expect(result.outputs).toHaveProperty('gather_b');
    expect(result.outputs).toHaveProperty('merge');
  });

  // --- Agent type integration ---

  it('emits agentType in stage:start events', async () => {
    const ctx = makeContext({
      skill: {
        name: 'typed-skill',
        description: 'Skill with agent types',
        stages: [
          { name: 'gather', prompt: 'Gather', tools: ['edgar'], agent_type: 'explore' as const },
          { name: 'analyze', prompt: 'Analyze', input_from: ['gather'] },
        ],
        output: { primary: 'analyze' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const agentTypes: Array<string | undefined> = [];

    engine.on('stage:start', (event) => {
      agentTypes.push(event.agentType);
    });

    await engine.run();
    expect(agentTypes[0]).toBe('explore');
    expect(agentTypes[1]).toBe('default');
  });

  it('uses agent config model when no model override or stage model', async () => {
    const ctx = makeContext({
      skill: {
        name: 'agent-config-skill',
        description: 'Test agent config',
        stages: [
          { name: 'gather', prompt: 'Gather', tools: ['edgar'] },
        ],
        output: { primary: 'gather' },
      },
      agentConfig: {
        explore: { model: 'gpt-4o-mini' },
      },
    });

    const engine = new PipelineEngine(ctx);
    const models: string[] = [];
    engine.on('stage:start', (event) => models.push(event.model));

    await engine.run();
    // 'gather' with tools and no input_from → explore → uses agentConfig model
    expect(models[0]).toBe('gpt-4o-mini');
  });

  it('respects maxConcurrency setting', async () => {
    const ctx = makeContext({
      skill: {
        name: 'concurrent-skill',
        description: 'Test concurrency',
        stages: [
          { name: 'a', prompt: 'A' },
          { name: 'b', prompt: 'B' },
          { name: 'c', prompt: 'C' },
        ],
        output: { primary: 'a' },
      },
      maxConcurrency: 1, // Force sequential
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(3);
  });

  // --- Sub-pipeline execution ---

  it('runs a sub_pipeline stage and returns sub-skill output', async () => {
    const subSkill = {
      name: 'sub-skill',
      description: 'A sub-skill',
      stages: [{ name: 'sub-stage', prompt: 'Do sub-thing' }],
      output: { primary: 'sub-stage' },
    };

    const ctx = makeContext({
      skill: {
        name: 'parent-skill',
        description: 'Parent with sub-pipeline',
        stages: [
          { name: 'delegate', sub_pipeline: 'sub-skill' },
          { name: 'summarize', prompt: 'Summarize', input_from: ['delegate'] },
        ],
        output: { primary: 'summarize' },
      },
      loadSkill: (name: string) => {
        if (name === 'sub-skill') return { skill: subSkill, filePath: '/test/sub.yaml', source: 'built-in' as const };
        return undefined;
      },
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(2);
    expect(result.outputs).toHaveProperty('delegate');
    expect(result.outputs).toHaveProperty('summarize');
  });

  it('emits prefixed stage events from sub-pipeline', async () => {
    const subSkill = {
      name: 'sub-skill',
      description: 'A sub-skill',
      stages: [{ name: 'inner', prompt: 'Inner task' }],
      output: { primary: 'inner' },
    };

    const ctx = makeContext({
      skill: {
        name: 'parent',
        description: 'Parent',
        stages: [{ name: 'outer', sub_pipeline: 'sub-skill' }],
        output: { primary: 'outer' },
      },
      loadSkill: (name: string) => {
        if (name === 'sub-skill') return { skill: subSkill, filePath: '/test/sub.yaml', source: 'built-in' as const };
        return undefined;
      },
    });

    const engine = new PipelineEngine(ctx);
    const stageNames: string[] = [];
    engine.on('stage:start', (e) => stageNames.push(e.stageName));

    await engine.run();
    // Should include both the outer stage:start AND the inner prefixed one
    expect(stageNames).toContain('outer');
    expect(stageNames).toContain('outer/inner');
  });

  it('handles missing sub_pipeline skill reference', async () => {
    const ctx = makeContext({
      skill: {
        name: 'parent',
        description: 'Parent',
        stages: [
          { name: 'delegate', sub_pipeline: 'nonexistent' },
        ],
        output: { primary: 'delegate' },
      },
      loadSkill: () => undefined,
    });

    const engine = new PipelineEngine(ctx);
    const errors: string[] = [];
    engine.on('stage:error', (e) => errors.push(e.stageName));

    const result = await engine.run();
    expect(result.partial).toBe(true);
    expect(result.failedStages).toContain('delegate');
  });

  it('handles missing loadSkill function gracefully', async () => {
    const ctx = makeContext({
      skill: {
        name: 'parent',
        description: 'Parent',
        stages: [{ name: 'delegate', sub_pipeline: 'some-skill' }],
        output: { primary: 'delegate' },
      },
      // No loadSkill provided
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.partial).toBe(true);
    expect(result.failedStages).toContain('delegate');
  });

  it('propagates abort signal to sub-pipeline', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const subSkill = {
      name: 'sub-skill',
      description: 'A sub-skill',
      stages: [{ name: 'inner', prompt: 'Task' }],
      output: { primary: 'inner' },
    };

    const ctx = makeContext({
      skill: {
        name: 'parent',
        description: 'Parent',
        stages: [{ name: 'outer', sub_pipeline: 'sub-skill' }],
        output: { primary: 'outer' },
      },
      loadSkill: (name: string) => {
        if (name === 'sub-skill') return { skill: subSkill, filePath: '/test/sub.yaml', source: 'built-in' as const };
        return undefined;
      },
      abortSignal: controller.signal,
    });

    const engine = new PipelineEngine(ctx);
    const result = await engine.run();
    expect(result.stagesCompleted).toBe(0);
    expect(result.partial).toBe(true);
  });
});
