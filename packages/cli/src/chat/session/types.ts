import type { ChatMessage } from '../types.js';

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  totalCostUsd: number;
  compactionBoundary?: number;
  compactionCount?: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  totalCostUsd: number;
}
