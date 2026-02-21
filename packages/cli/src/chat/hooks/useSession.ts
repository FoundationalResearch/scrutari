import { useState, useEffect, useCallback, useRef } from 'react';
import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../types.js';
import type { Session } from '../session/types.js';
import { saveSession, loadSession, getLatestSession } from '../session/storage.js';

interface UseSessionOptions {
  continueLatest?: boolean;
  resumeId?: string;
}

interface UseSessionReturn {
  session: Session;
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  replaceMessages: (newMessages: ChatMessage[], metadata?: { compactionBoundary?: number }) => void;
  addCost: (cost: number) => void;
  save: () => void;
}

export function useSession(options: UseSessionOptions = {}): UseSessionReturn {
  const [session, setSession] = useState<Session>(() => {
    if (options.resumeId) {
      const loaded = loadSession(options.resumeId);
      if (loaded) return loaded;
    }
    if (options.continueLatest) {
      const latest = getLatestSession();
      if (latest) return latest;
    }
    return {
      id: randomUUID(),
      title: 'New Session',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalCostUsd: 0,
    };
  });

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const save = useCallback(() => {
    saveSession(sessionRef.current);
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(save, 30_000);
    return () => clearInterval(interval);
  }, [save]);

  const addMessage = useCallback((message: ChatMessage) => {
    setSession(prev => {
      const updated = {
        ...prev,
        messages: [...prev.messages, message],
        updatedAt: Date.now(),
        title: prev.messages.length === 0 && message.role === 'user'
          ? message.content.slice(0, 50)
          : prev.title,
      };
      return updated;
    });
  }, []);

  const updateMessage = useCallback((id: string, update: Partial<ChatMessage>) => {
    setSession(prev => {
      const messages = prev.messages.map(m =>
        m.id === id ? { ...m, ...update } : m,
      );
      return { ...prev, messages, updatedAt: Date.now() };
    });
  }, []);

  const replaceMessages = useCallback((newMessages: ChatMessage[], metadata?: { compactionBoundary?: number }) => {
    setSession(prev => ({
      ...prev,
      messages: newMessages,
      updatedAt: Date.now(),
      compactionBoundary: metadata?.compactionBoundary,
      compactionCount: (prev.compactionCount ?? 0) + 1,
    }));
  }, []);

  const addCost = useCallback((cost: number) => {
    setSession(prev => ({
      ...prev,
      totalCostUsd: prev.totalCostUsd + cost,
      updatedAt: Date.now(),
    }));
  }, []);

  return {
    session,
    messages: session.messages,
    addMessage,
    updateMessage,
    replaceMessages,
    addCost,
    save,
  };
}
