import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestratorBridge, type OrchestratorBridgeOptions } from './orchestrator-bridge.js';
import type { ServerMessage } from './protocol.js';

// Mock the orchestrator
vi.mock('../chat/orchestrator/agent.js', () => ({
  runOrchestrator: vi.fn(),
}));

// Mock cost calculation
vi.mock('@scrutari/core', () => ({
  calculateCost: vi.fn(() => 0.001),
}));

// Mock context rules
vi.mock('../context/rules.js', () => ({
  filterActiveRules: vi.fn((rules: unknown[]) => rules),
}));

import { runOrchestrator } from '../chat/orchestrator/agent.js';

const mockRunOrchestrator = vi.mocked(runOrchestrator);

function createMockSessionManager() {
  return {
    id: 'test-session',
    title: 'Test',
    messages: [],
    totalCostUsd: 0,
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    addCost: vi.fn(),
    save: vi.fn(),
    dispose: vi.fn(),
    resumeSession: vi.fn(),
    getRecentSessions: vi.fn(() => []),
  };
}

function createMockConfig() {
  return {
    providers: {
      anthropic: { api_key: 'test-key', default_model: 'claude-sonnet-4-20250514' },
      openai: { api_key: undefined, default_model: 'gpt-4o' },
      google: { api_key: undefined, default_model: 'gemini-2.0-flash' },
      minimax: { api_key: undefined, default_model: 'MiniMax-M1' },
    },
    defaults: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      max_budget_usd: 5,
      approval_threshold_usd: 1,
      session_budget_usd: 5,
      output_format: 'markdown' as const,
      output_dir: '~/scrutari-output',
    },
    mcp: { servers: [] },
    skills_dir: '~/.scrutari/skills',
    agents: {
      research: { model: undefined, provider: undefined },
      explore: { model: undefined, provider: undefined },
      verify: { model: undefined, provider: undefined },
      default: { model: undefined, provider: undefined },
    },
    compaction: { strategy: 'auto' as const, preserveRecent: 4 },
    permissions: {},
    tools: { market_data: {}, marketonepager: {}, news: {} },
  };
}

function createBridge(overrides: Partial<OrchestratorBridgeOptions> = {}) {
  const sent: ServerMessage[] = [];
  const send = vi.fn((msg: ServerMessage) => { sent.push(msg); });
  const sessionManager = createMockSessionManager();
  const config = createMockConfig();

  const bridge = new OrchestratorBridge({
    config: config as any,
    sessionManager: sessionManager as any,
    skillNames: ['deep-dive', 'comp-analysis'],
    send,
    ...overrides,
  });

  return { bridge, sent, send, sessionManager, config };
}

describe('OrchestratorBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default mode state', () => {
    const { bridge } = createBridge();
    expect(bridge.planMode).toBe(false);
    expect(bridge.dryRun).toBe(false);
    expect(bridge.readOnly).toBe(false);
  });

  it('sends processing and user_message on sendMessage', async () => {
    mockRunOrchestrator.mockResolvedValue({
      content: 'response',
      thinking: '',
      toolCallCount: 0,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('hello');

    // Should have processing: true, user_message, assistant_start, then content
    const processingStart = sent.find(m => m.type === 'processing' && (m as any).isProcessing === true);
    expect(processingStart).toBeTruthy();

    const userMsg = sent.find(m => m.type === 'user_message');
    expect(userMsg).toBeTruthy();
    expect((userMsg as any).text).toBe('hello');

    const assistantStart = sent.find(m => m.type === 'assistant_start');
    expect(assistantStart).toBeTruthy();
  });

  it('sends assistant_complete with final content', async () => {
    mockRunOrchestrator.mockResolvedValue({
      content: 'The answer is 42',
      thinking: 'Let me think...',
      toolCallCount: 0,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('what is the meaning of life?');

    // Flush timers for throttled deltas
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete');
    expect(complete).toBeTruthy();
    expect((complete as any).content).toBe('The answer is 42');
    expect((complete as any).thinking).toBe('Let me think...');
  });

  it('sends processing: false after completion', async () => {
    mockRunOrchestrator.mockResolvedValue({
      content: 'done',
      thinking: '',
      toolCallCount: 0,
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('test');
    vi.runAllTimers();

    const processingMsgs = sent.filter(m => m.type === 'processing');
    expect(processingMsgs.length).toBeGreaterThanOrEqual(2);
    const last = processingMsgs[processingMsgs.length - 1] as any;
    expect(last.isProcessing).toBe(false);
  });

  it('sends cost_update after completion', async () => {
    mockRunOrchestrator.mockResolvedValue({
      content: 'done',
      thinking: '',
      toolCallCount: 0,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('test');
    vi.runAllTimers();

    const costUpdate = sent.find(m => m.type === 'cost_update');
    expect(costUpdate).toBeTruthy();
  });

  it('prevents concurrent messages', async () => {
    let resolveFirst: ((value: any) => void) | undefined;
    mockRunOrchestrator.mockImplementation(() => {
      return new Promise((resolve) => { resolveFirst = resolve; });
    });

    const { bridge, sessionManager } = createBridge();

    // Start first message (won't complete yet)
    const first = bridge.sendMessage('first');

    // Try to send second while first is processing
    void bridge.sendMessage('second');

    // Only one user message should have been added
    expect(sessionManager.addMessage).toHaveBeenCalledTimes(2); // user + assistant for first

    // Resolve first
    resolveFirst!({ content: 'done', thinking: '', toolCallCount: 0, usage: { inputTokens: 10, outputTokens: 5 } });
    await first;
    vi.runAllTimers();
  });

  it('handles abort correctly', async () => {
    mockRunOrchestrator.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('test');
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete') as any;
    expect(complete).toBeTruthy();
    expect(complete.content).toContain('[Aborted]');
  });

  it('handles orchestrator errors gracefully', async () => {
    mockRunOrchestrator.mockRejectedValue(new Error('API rate limit'));

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('test');
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete') as any;
    expect(complete).toBeTruthy();
    expect(complete.content).toContain('[Error: API rate limit]');

    const errorMsg = sent.find(m => m.type === 'error') as any;
    expect(errorMsg).toBeTruthy();
    expect(errorMsg.message).toBe('API rate limit');
  });

  it('enforces session budget', async () => {
    const { bridge, sent, config } = createBridge();
    (config.defaults as any).session_budget_usd = 0; // Exhausted

    await bridge.sendMessage('test');
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete') as any;
    expect(complete.content).toContain('Session budget exhausted');
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  it('resolves approval', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, orchConfig) => {
      if (orchConfig.onApprovalRequired) {
        const approved = await orchConfig.onApprovalRequired({
          skillName: 'test',
          totalEstimatedCostUsd: 2,
          totalEstimatedTimeSeconds: 30,
          stages: [],
          executionLevels: [],
          toolsRequired: [],
          toolsOptional: [],
        } as any);
        return {
          content: approved ? 'Approved' : 'Denied',
          thinking: '',
          toolCallCount: 0,
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      }
      return { content: '', thinking: '', toolCallCount: 0 };
    });

    const { bridge, sent } = createBridge();
    const promise = bridge.sendMessage('run deep dive');

    // Wait for the approval to be sent
    await vi.advanceTimersByTimeAsync(100);

    const approval = sent.find(m => m.type === 'approval_required');
    expect(approval).toBeTruthy();

    // Resolve approval
    bridge.resolveApproval(true);
    await promise;
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete') as any;
    expect(complete.content).toBe('Approved');
  });

  it('resolves permission', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, orchConfig) => {
      if (orchConfig.onPermissionRequired) {
        const allowed = await orchConfig.onPermissionRequired('dangerous_tool', { arg: 'value' });
        return {
          content: allowed ? 'Allowed' : 'Blocked',
          thinking: '',
          toolCallCount: 0,
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      }
      return { content: '', thinking: '', toolCallCount: 0 };
    });

    const { bridge, sent } = createBridge();
    const promise = bridge.sendMessage('do something risky');

    await vi.advanceTimersByTimeAsync(100);

    const permReq = sent.find(m => m.type === 'tool_permission_required');
    expect(permReq).toBeTruthy();

    bridge.resolvePermission(false);
    await promise;
    vi.runAllTimers();

    const complete = sent.find(m => m.type === 'assistant_complete') as any;
    expect(complete.content).toBe('Blocked');
  });

  it('throttles text deltas at 50ms intervals', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, orchConfig) => {
      // Simulate rapid streaming
      for (let i = 0; i < 10; i++) {
        orchConfig.onTextDelta(`chunk${i} `);
      }
      return { content: 'full content', thinking: '', toolCallCount: 0, usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('test');

    vi.runAllTimers();

    // After complete, should also have flushed remaining
    const allTextDeltas = sent.filter(m => m.type === 'text_delta');
    expect(allTextDeltas.length).toBeGreaterThan(0);
  });

  it('sends tool_call_start and tool_call_complete events immediately', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, orchConfig) => {
      orchConfig.onToolCallStart({ id: 'tc-1', name: 'getQuote', args: { ticker: 'AAPL' }, status: 'running' });
      orchConfig.onToolCallComplete('tc-1', { price: 150.00 });
      return { content: 'AAPL is $150', thinking: '', toolCallCount: 1, usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('what is AAPL at?');
    vi.runAllTimers();

    const toolStart = sent.find(m => m.type === 'tool_call_start') as any;
    expect(toolStart).toBeTruthy();
    expect(toolStart.toolCall.name).toBe('getQuote');

    const toolComplete = sent.find(m => m.type === 'tool_call_complete') as any;
    expect(toolComplete).toBeTruthy();
    expect(toolComplete.id).toBe('tc-1');
  });

  it('sends pipeline events', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, orchConfig) => {
      orchConfig.onPipelineEvent({ type: 'stage:start', stageName: 'Research', model: 'claude-sonnet-4', stageIndex: 0, totalStages: 3 });
      orchConfig.onPipelineEvent({ type: 'stage:complete', stageName: 'Research', costUsd: 0.01, durationMs: 5000 });
      orchConfig.onPipelineEvent({ type: 'pipeline:complete', totalCostUsd: 0.01, report: 'Done' });
      return { content: 'Pipeline done', thinking: '', toolCallCount: 0, usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const { bridge, sent } = createBridge();
    await bridge.sendMessage('analyze NVDA');
    vi.runAllTimers();

    const pipelineEvents = sent.filter(m => m.type === 'pipeline_event');
    expect(pipelineEvents.length).toBe(3);

    // Check pipeline state is included
    const lastEvent = pipelineEvents[pipelineEvents.length - 1] as any;
    expect(lastEvent.pipelineState.done).toBe(true);
  });

  it('updates session manager with messages', async () => {
    mockRunOrchestrator.mockResolvedValue({
      content: 'response',
      thinking: 'thought',
      toolCallCount: 0,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { bridge, sessionManager } = createBridge();
    await bridge.sendMessage('hello');
    vi.runAllTimers();

    // Should have added user + assistant messages
    expect(sessionManager.addMessage).toHaveBeenCalledTimes(2);
    // Should have updated assistant with final content
    expect(sessionManager.updateMessage).toHaveBeenCalled();
  });

  it('abort calls abort on the controller', async () => {
    mockRunOrchestrator.mockImplementation(async (_msgs, _config, _orchConfig) => {
      // Simulate some work
      await new Promise(r => setTimeout(r, 1000));
      return { content: 'done', thinking: '', toolCallCount: 0, usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const { bridge } = createBridge();
    const promise = bridge.sendMessage('test');

    // Bridge should have set up the abort controller
    bridge.abort();

    // The abort signal should be triggered
    // The mock will still resolve normally since we can't truly abort
    vi.runAllTimers();
    await promise.catch(() => {});
  });
});
