import { useState, useMemo, useRef, useCallback } from 'react';
import {
  getContextWindowSize,
  estimateMessagesTokens,
  compactMessages,
  type CompactableMessage,
} from '@scrutari/core';
import type { Config } from '../../config/index.js';
import type { ChatMessage } from '../types.js';

export interface CompactionState {
  contextUsage: {
    estimatedTokens: number;
    maxTokens: number;
    percentage: number;
    lastActualTokens?: number;
  };
  compactionBoundary: number;
  compactionCount: number;
  isCompacting: boolean;
}

export interface UseCompactionOptions {
  config: Config;
  messages: ChatMessage[];
  systemPromptTokens: number;
  replaceMessages: (msgs: ChatMessage[], meta?: { compactionBoundary?: number }) => void;
  addSystemMessage: (content: string) => void;
}

export interface UseCompactionReturn {
  state: CompactionState;
  triggerCompaction: (userInstructions?: string) => Promise<void>;
  updateActualUsage: (inputTokens: number) => void;
  shouldAutoCompact: () => boolean;
}

export function useCompaction({
  config,
  messages,
  systemPromptTokens,
  replaceMessages,
  addSystemMessage,
}: UseCompactionOptions): UseCompactionReturn {
  const [isCompacting, setIsCompacting] = useState(false);
  const boundaryRef = useRef(0);
  const compactionCountRef = useRef(0);
  const calibrationRatioRef = useRef(1.0);
  const lastActualTokensRef = useRef<number | undefined>(undefined);

  const compactionConfig = config.compaction ?? {
    enabled: true,
    auto_threshold: 0.85,
    preserve_turns: 4,
    model: 'claude-haiku-3-5-20241022',
  };

  const maxTokens = getContextWindowSize(config.defaults.model);

  const estimatedTokens = useMemo(() => {
    const coreMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const raw = estimateMessagesTokens(coreMessages) + systemPromptTokens;
    return Math.round(raw * calibrationRatioRef.current);
  }, [messages, systemPromptTokens]);

  const percentage = maxTokens > 0 ? estimatedTokens / maxTokens : 0;

  const state: CompactionState = {
    contextUsage: {
      estimatedTokens,
      maxTokens,
      percentage,
      lastActualTokens: lastActualTokensRef.current,
    },
    compactionBoundary: boundaryRef.current,
    compactionCount: compactionCountRef.current,
    isCompacting,
  };

  const shouldAutoCompact = useCallback((): boolean => {
    if (!compactionConfig.enabled) return false;
    const threshold = compactionConfig.auto_threshold ?? 0.85;
    return estimatedTokens > threshold * maxTokens;
  }, [estimatedTokens, maxTokens, compactionConfig.enabled, compactionConfig.auto_threshold]);

  const triggerCompaction = useCallback(async (userInstructions?: string) => {
    if (isCompacting || messages.length < 4) return;

    setIsCompacting(true);

    try {
      const compactableMessages: CompactableMessage[] = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        isCompactionSummary: m.isCompactionSummary,
        compactedMessageIds: m.compactedMessageIds,
      }));

      const result = await compactMessages({
        messages: compactableMessages,
        compactionBoundary: boundaryRef.current,
        userInstructions,
        providerConfig: {
          providers: {
            anthropic: { apiKey: config.providers.anthropic.api_key },
            openai: { apiKey: config.providers.openai.api_key },
            google: { apiKey: config.providers.google.api_key },
          },
        },
        contextWindowSize: maxTokens,
        preserveRecentTurns: compactionConfig.preserve_turns ?? 4,
        compactionModel: compactionConfig.model ?? 'claude-haiku-3-5-20241022',
      });

      if (result.compactedMessageCount < result.originalMessageCount) {
        // Map CompactableMessage back to ChatMessage
        const newMessages: ChatMessage[] = result.compactedMessages.map(m => {
          // Find the original message to preserve full ChatMessage fields
          const original = messages.find(orig => orig.id === m.id);
          if (original) return original;

          // This is the new summary message
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            isCompactionSummary: m.isCompactionSummary,
            compactedMessageIds: m.compactedMessageIds,
            compactedAt: Date.now(),
          };
        });

        boundaryRef.current = result.newBoundary;
        compactionCountRef.current += 1;
        replaceMessages(newMessages, { compactionBoundary: result.newBoundary });

        const savedTokens = result.originalTokens - result.summaryTokens;
        addSystemMessage(
          `Context compacted: ${result.originalMessageCount} → ${result.compactedMessageCount} messages` +
          ` (~${formatTokens(savedTokens)} tokens freed, cost: $${result.costUsd.toFixed(4)})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addSystemMessage(`Compaction failed: ${message}`);
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, messages, config, maxTokens, compactionConfig, replaceMessages, addSystemMessage]);

  const updateActualUsage = useCallback((inputTokens: number) => {
    lastActualTokensRef.current = inputTokens;
    if (estimatedTokens > 0 && inputTokens > 0) {
      const ratio = inputTokens / estimatedTokens;
      // Exponential moving average for smooth calibration
      calibrationRatioRef.current = calibrationRatioRef.current * 0.7 + ratio * 0.3;
    }
  }, [estimatedTokens]);

  return { state, triggerCompaction, updateActualUsage, shouldAutoCompact };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
