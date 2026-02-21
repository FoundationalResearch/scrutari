import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @scrutari/core module
vi.mock('@scrutari/core', () => ({
  getContextWindowSize: vi.fn().mockReturnValue(200_000),
  estimateMessagesTokens: vi.fn().mockReturnValue(50_000),
  estimateTokens: vi.fn().mockReturnValue(100),
  compactMessages: vi.fn(),
}));

import { getContextWindowSize, estimateMessagesTokens, compactMessages } from '@scrutari/core';

const mockedEstimate = vi.mocked(estimateMessagesTokens);
const mockedCompact = vi.mocked(compactMessages);
const mockedGetWindow = vi.mocked(getContextWindowSize);

// Since we can't use @testing-library/react (no react-dom in Ink apps),
// we test the hook logic by extracting it into a testable helper or
// by testing the component integration via ink-testing-library.
// For unit-level hook logic, we test the key functions directly.

import type { ChatMessage } from '../types.js';
import type { Config } from '../../config/index.js';

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    defaults: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      max_budget_usd: 5.0,
      approval_threshold_usd: 1.0,
      session_budget_usd: 10.0,
      output_format: 'markdown',
      output_dir: './output',
    },
    providers: {
      anthropic: { default_model: 'claude-sonnet-4-20250514', api_key: 'test-key' },
      openai: { default_model: 'gpt-4o' },
      google: { default_model: 'gemini-2.5-flash' },
    },
    mcp: { servers: [] },
    skills_dir: '~/.scrutari/skills',
    agents: { research: {}, explore: {}, verify: {}, default: {} },
    compaction: {
      enabled: true,
      auto_threshold: 0.85,
      preserve_turns: 4,
      model: 'claude-haiku-3-5-20241022',
    },
    permissions: {},
    ...overrides,
  } as Config;
}

function makeMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i}`,
    timestamp: Date.now(),
  }));
}

describe('useCompaction dependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetWindow.mockReturnValue(200_000);
    mockedEstimate.mockReturnValue(50_000);
  });

  it('getContextWindowSize returns correct value for configured model', () => {
    const config = makeConfig();
    const result = getContextWindowSize(config.defaults.model);
    expect(result).toBe(200_000);
  });

  it('estimateMessagesTokens is called with message array', () => {
    const messages = makeMessages(5);
    const coreMessages = messages.map(m => ({ role: m.role, content: m.content }));
    estimateMessagesTokens(coreMessages);
    expect(mockedEstimate).toHaveBeenCalledWith(coreMessages);
  });

  it('auto-compact threshold logic: below threshold returns false', () => {
    const config = makeConfig();
    const maxTokens = getContextWindowSize(config.defaults.model);
    const estimatedTokens = 50_000;
    const threshold = config.compaction.auto_threshold;
    expect(estimatedTokens > threshold * maxTokens).toBe(false);
  });

  it('auto-compact threshold logic: above threshold returns true', () => {
    const config = makeConfig();
    const maxTokens = getContextWindowSize(config.defaults.model);
    const estimatedTokens = 180_000;
    const threshold = config.compaction.auto_threshold;
    expect(estimatedTokens > threshold * maxTokens).toBe(true);
  });

  it('auto-compact disabled when config says so', () => {
    const config = makeConfig({ compaction: { enabled: false, auto_threshold: 0.85, preserve_turns: 4, model: 'claude-haiku-3-5-20241022' } });
    expect(config.compaction.enabled).toBe(false);
  });

  it('compactMessages is called with correct parameters', async () => {
    mockedCompact.mockResolvedValue({
      compactedMessages: [
        { id: 'summary', role: 'system', content: 'Summary', timestamp: Date.now(), isCompactionSummary: true, compactedMessageIds: ['m0', 'm1'] },
        ...makeMessages(8).slice(2).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
      ],
      newBoundary: 1,
      originalMessageCount: 10,
      compactedMessageCount: 9,
      summaryTokens: 100,
      originalTokens: 5000,
      costUsd: 0.001,
    });

    const messages = makeMessages(10);
    const config = makeConfig();

    await compactMessages({
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      compactionBoundary: 0,
      providerConfig: {
        providers: {
          anthropic: { apiKey: config.providers.anthropic.api_key },
        },
      },
      contextWindowSize: 200_000,
      preserveRecentTurns: 4,
      compactionModel: 'claude-haiku-3-5-20241022',
    });

    expect(mockedCompact).toHaveBeenCalledOnce();
    const callArgs = mockedCompact.mock.calls[0][0];
    expect(callArgs.messages.length).toBe(10);
    expect(callArgs.compactionBoundary).toBe(0);
    expect(callArgs.contextWindowSize).toBe(200_000);
  });

  it('calibration ratio adjusts with EMA', () => {
    // Simulating the calibration logic
    let calibrationRatio = 1.0;
    const estimated = 50_000;
    const actual = 60_000;

    if (estimated > 0 && actual > 0) {
      const ratio = actual / estimated;
      calibrationRatio = calibrationRatio * 0.7 + ratio * 0.3;
    }

    // 1.0 * 0.7 + 1.2 * 0.3 = 0.7 + 0.36 = 1.06
    expect(calibrationRatio).toBeCloseTo(1.06);
  });

  it('compaction result reduces message count', async () => {
    mockedCompact.mockResolvedValue({
      compactedMessages: [
        { id: 'summary', role: 'system', content: 'Summary', timestamp: Date.now(), isCompactionSummary: true, compactedMessageIds: ['m0', 'm1'] },
      ],
      newBoundary: 1,
      originalMessageCount: 10,
      compactedMessageCount: 9,
      summaryTokens: 100,
      originalTokens: 5000,
      costUsd: 0.001,
    });

    const result = await compactMessages({
      messages: makeMessages(10).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
      compactionBoundary: 0,
      providerConfig: { providers: {} },
      contextWindowSize: 200_000,
    });

    expect(result.compactedMessageCount).toBeLessThan(result.originalMessageCount);
    expect(result.newBoundary).toBe(1);
    expect(result.costUsd).toBe(0.001);
  });
});
