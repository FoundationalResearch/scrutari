import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompactableMessage, CompactionRequest } from './compactor.js';

// Mock callLLM before importing compactor
vi.mock('../router/llm.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../router/providers.js', () => ({
  ProviderRegistry: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({}),
  })),
}));

import { compactMessages } from './compactor.js';
import { callLLM } from '../router/llm.js';

const mockedCallLLM = vi.mocked(callLLM);

function makeMessage(id: string, role: 'user' | 'assistant' | 'system', content: string, extra?: Partial<CompactableMessage>): CompactableMessage {
  return {
    id,
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

const baseRequest: Omit<CompactionRequest, 'messages' | 'compactionBoundary'> = {
  providerConfig: { providers: { anthropic: { apiKey: 'test-key' } } },
  contextWindowSize: 200_000,
};

describe('compactMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCallLLM.mockResolvedValue({
      content: '## Session Summary (Compacted)\n\nSummary of conversation.',
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    });
  });

  it('skips compaction when not enough messages to compact', async () => {
    // With default preserveRecentTurns=4 (8 messages), 8 messages = nothing to compact
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    expect(result.compactedMessages).toEqual(messages);
    expect(result.costUsd).toBe(0);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it('skips compaction for empty message array', async () => {
    const result = await compactMessages({
      ...baseRequest,
      messages: [],
      compactionBoundary: 0,
    });

    expect(result.compactedMessages).toEqual([]);
    expect(result.costUsd).toBe(0);
  });

  it('compacts messages older than preserve window', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    // Should have: 1 summary + 8 preserved = 9 messages
    expect(result.compactedMessages.length).toBe(9);
    expect(result.originalMessageCount).toBe(12);
    expect(result.compactedMessageCount).toBe(9);
    expect(mockedCallLLM).toHaveBeenCalledOnce();
  });

  it('sets isCompactionSummary on summary message', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    const summary = result.compactedMessages[0];
    expect(summary.isCompactionSummary).toBe(true);
    expect(summary.role).toBe('system');
    expect(summary.content).toContain('Session Summary');
  });

  it('stores compactedMessageIds on summary', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    const summary = result.compactedMessages[0];
    // Messages 0-3 should be compacted (12 total - 8 preserved = 4 to compact)
    expect(summary.compactedMessageIds).toEqual(['m0', 'm1', 'm2', 'm3']);
  });

  it('preserves last N turns verbatim', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Content of message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    // Last 8 messages should be preserved verbatim
    const preserved = result.compactedMessages.slice(1);
    expect(preserved.length).toBe(8);
    expect(preserved[0].id).toBe('m4');
    expect(preserved[7].id).toBe('m11');
  });

  it('respects compaction boundary', async () => {
    const messages = Array.from({ length: 14 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 2, // messages 0-1 already compacted
    });

    // Should compact messages 2-5 (boundary=2 to length-8=6), preserve 6-13
    const summary = result.compactedMessages[0];
    expect(summary.compactedMessageIds).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('includes previous summary in compaction input', async () => {
    const summaryMsg = makeMessage('summary-1', 'system', 'Previous summary content', {
      isCompactionSummary: true,
    });
    const messages = [
      summaryMsg,
      ...Array.from({ length: 12 }, (_, i) =>
        makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
      ),
    ];

    await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    // The transcript sent to LLM should include the previous summary
    const callArgs = mockedCallLLM.mock.calls[0][0];
    const transcript = callArgs.messages[0].content;
    expect(transcript).toContain('Previous summary content');
  });

  it('passes user instructions to prompt builder', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
      userInstructions: 'keep all NVDA metrics',
    });

    const callArgs = mockedCallLLM.mock.calls[0][0];
    expect(callArgs.system).toContain('keep all NVDA metrics');
  });

  it('uses the specified compaction model', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
      compactionModel: 'claude-haiku-3-5-20241022',
    });

    const callArgs = mockedCallLLM.mock.calls[0][0];
    expect(callArgs.modelId).toBe('claude-haiku-3-5-20241022');
  });

  it('returns cost from LLM response', async () => {
    mockedCallLLM.mockResolvedValue({
      content: 'Summary',
      usage: { inputTokens: 200, outputTokens: 100, costUsd: 0.005 },
    });

    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    expect(result.costUsd).toBe(0.005);
  });

  it('sets newBoundary to 1 after compaction', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    expect(result.newBoundary).toBe(1);
  });

  it('falls back to truncation when LLM call fails', async () => {
    mockedCallLLM.mockRejectedValue(new Error('Network error'));

    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
    });

    // Should still return something usable (truncated)
    expect(result.compactedMessages.length).toBeLessThanOrEqual(messages.length);
    expect(result.costUsd).toBe(0);
    expect(result.summaryTokens).toBe(0);
  });

  it('respects custom preserveRecentTurns', async () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    );

    const result = await compactMessages({
      ...baseRequest,
      messages,
      compactionBoundary: 0,
      preserveRecentTurns: 2, // preserve 4 messages
    });

    // 1 summary + 4 preserved = 5
    expect(result.compactedMessages.length).toBe(5);
    // With preserveRecentTurns=2, preserve last 4, compact 8
    const summary = result.compactedMessages[0];
    expect(summary.compactedMessageIds?.length).toBe(8);
  });
});
