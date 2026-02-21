import type { ProviderConfig } from '../router/providers.js';
import { ProviderRegistry } from '../router/providers.js';
import { callLLM } from '../router/llm.js';
import { estimateTokens } from '../router/token-estimator.js';
import { buildCompactionPrompt } from './prompts.js';

export interface CompactableMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isCompactionSummary?: boolean;
  compactedMessageIds?: string[];
}

export interface CompactionRequest {
  messages: CompactableMessage[];
  compactionBoundary: number;
  userInstructions?: string;
  providerConfig: ProviderConfig;
  contextWindowSize: number;
  preserveRecentTurns?: number;
  compactionModel?: string;
  abortSignal?: AbortSignal;
}

export interface CompactionResult {
  compactedMessages: CompactableMessage[];
  newBoundary: number;
  originalMessageCount: number;
  compactedMessageCount: number;
  summaryTokens: number;
  originalTokens: number;
  costUsd: number;
}

const DEFAULT_COMPACTION_MODEL = 'claude-haiku-3-5-20241022';
const DEFAULT_PRESERVE_RECENT_TURNS = 4;

export async function compactMessages(request: CompactionRequest): Promise<CompactionResult> {
  const {
    messages,
    compactionBoundary,
    userInstructions,
    providerConfig,
    preserveRecentTurns = DEFAULT_PRESERVE_RECENT_TURNS,
    compactionModel = DEFAULT_COMPACTION_MODEL,
    abortSignal,
  } = request;

  const preserveCount = preserveRecentTurns * 2; // user+assistant pairs

  // Split messages into compactable and preserved regions
  const preserveStart = Math.max(compactionBoundary, messages.length - preserveCount);
  const toCompact = messages.slice(compactionBoundary, preserveStart);
  const preserved = messages.slice(preserveStart);

  // Nothing to compact
  if (toCompact.length < 2) {
    return {
      compactedMessages: messages,
      newBoundary: compactionBoundary,
      originalMessageCount: messages.length,
      compactedMessageCount: messages.length,
      summaryTokens: 0,
      originalTokens: 0,
      costUsd: 0,
    };
  }

  // Format messages as a transcript for the compaction LLM
  const transcript = toCompact
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  const originalTokens = estimateTokens(transcript);
  const compactionPrompt = buildCompactionPrompt(userInstructions);

  // Use callLLM for non-streaming compaction
  const registry = new ProviderRegistry(providerConfig);
  const model = registry.getModel(compactionModel);

  let summaryContent: string;
  let costUsd: number;

  try {
    const response = await callLLM({
      model,
      modelId: compactionModel,
      system: compactionPrompt,
      messages: [{ role: 'user', content: transcript }],
      maxOutputTokens: 4096,
      temperature: 0,
      abortSignal,
    });

    summaryContent = response.content;
    costUsd = response.usage.costUsd;
  } catch (error) {
    // Fallback: simple truncation on LLM failure
    return fallbackTruncation(messages, preserveCount, request.contextWindowSize);
  }

  // Collect IDs of compacted messages
  const compactedMessageIds = toCompact.map(m => m.id);

  const summaryMessage: CompactableMessage = {
    id: `compaction-${Date.now()}`,
    role: 'system',
    content: summaryContent,
    timestamp: Date.now(),
    isCompactionSummary: true,
    compactedMessageIds,
  };

  const compactedMessages = [summaryMessage, ...preserved];
  const summaryTokens = estimateTokens(summaryContent);

  return {
    compactedMessages,
    newBoundary: 1, // summary is at index 0
    originalMessageCount: messages.length,
    compactedMessageCount: compactedMessages.length,
    summaryTokens,
    originalTokens,
    costUsd,
  };
}

function fallbackTruncation(
  messages: CompactableMessage[],
  preserveCount: number,
  contextWindowSize: number,
): CompactionResult {
  // Keep only the most recent messages that fit in 80% of context
  const targetTokens = contextWindowSize * 0.8;
  const preserved: CompactableMessage[] = [];
  let tokenCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (tokenCount + msgTokens > targetTokens && preserved.length >= preserveCount) {
      break;
    }
    preserved.unshift(messages[i]);
    tokenCount += msgTokens;
  }

  return {
    compactedMessages: preserved,
    newBoundary: 0,
    originalMessageCount: messages.length,
    compactedMessageCount: preserved.length,
    summaryTokens: 0,
    originalTokens: tokenCount,
    costUsd: 0,
  };
}
