import { useRef, useCallback, useEffect } from 'react';
import type { ChatMessage } from '../types.js';

interface ThrottledUpdateOptions {
  intervalMs?: number;
}

interface UseThrottledUpdateReturn {
  throttledUpdate: (id: string, update: Partial<ChatMessage>) => void;
  flush: () => void;
}

/**
 * Batches high-frequency `updateMessage` calls and flushes them at a fixed
 * interval (default 100 ms ≈ 10 renders/sec). This prevents the 20-50
 * per-second React re-renders that cause terminal flickering during LLM
 * streaming.
 *
 * Low-frequency events (tool calls, pipeline events) should continue to
 * call `updateMessage` directly for immediate feedback.
 */
export function useThrottledUpdate(
  updateMessage: (id: string, update: Partial<ChatMessage>) => void,
  options: ThrottledUpdateOptions = {},
): UseThrottledUpdateReturn {
  const intervalMs = options.intervalMs ?? 100;

  // Pending updates keyed by message ID. Multiple updates to the same ID
  // are merged (later keys overwrite earlier ones).
  const pendingRef = useRef<Map<string, Partial<ChatMessage>>>(new Map());

  // Keep a stable reference to the latest updateMessage so the interval
  // callback never captures a stale closure.
  const updateRef = useRef(updateMessage);
  updateRef.current = updateMessage;

  const doFlush = useCallback(() => {
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    for (const [id, update] of pending) {
      updateRef.current(id, update);
    }
    pending.clear();
  }, []);

  // Start/stop the flush interval.
  useEffect(() => {
    const timer = setInterval(doFlush, intervalMs);
    return () => {
      clearInterval(timer);
      // Flush remaining buffer on unmount so no content is lost.
      doFlush();
    };
  }, [doFlush, intervalMs]);

  const throttledUpdate = useCallback(
    (id: string, update: Partial<ChatMessage>) => {
      const existing = pendingRef.current.get(id);
      pendingRef.current.set(
        id,
        existing ? { ...existing, ...update } : { ...update },
      );
    },
    [],
  );

  return { throttledUpdate, flush: doFlush };
}
