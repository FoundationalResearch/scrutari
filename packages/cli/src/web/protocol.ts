import { z } from 'zod';
import type { PipelineEvent, ToolCallInfo, PipelineRunState, DryRunPreviewData } from '../chat/types.js';
import type { SessionSummary } from '../chat/session/types.js';
import type { PipelineEstimate } from '@scrutari/core';

// ── Client → Server Messages ──────────────────────────────────

export const SendMessageSchema = z.object({
  type: z.literal('send_message'),
  text: z.string().min(1),
});

export const ApprovalResponseSchema = z.object({
  type: z.literal('approval_response'),
  approved: z.boolean(),
});

export const AbortSchema = z.object({
  type: z.literal('abort'),
});

export const SetModeSchema = z.object({
  type: z.literal('set_mode'),
  mode: z.enum(['plan', 'dry-run', 'read-only']),
  enabled: z.boolean(),
});

export const GetSessionsSchema = z.object({
  type: z.literal('get_sessions'),
});

export const ResumeSessionSchema = z.object({
  type: z.literal('resume_session'),
  sessionId: z.string().min(1),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  SendMessageSchema,
  ApprovalResponseSchema,
  AbortSchema,
  SetModeSchema,
  GetSessionsSchema,
  ResumeSessionSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;
export type SetMode = z.infer<typeof SetModeSchema>;
export type ResumeSession = z.infer<typeof ResumeSessionSchema>;

// ── Server → Client Messages ──────────────────────────────────

export interface InitMessage {
  type: 'init';
  version: string;
  model: string;
  provider: string;
  skills: string[];
  recentSessions: SessionSummary[];
  modes: {
    plan: boolean;
    dryRun: boolean;
    readOnly: boolean;
  };
}

export interface UserMessageEcho {
  type: 'user_message';
  id: string;
  text: string;
  timestamp: number;
}

export interface AssistantStart {
  type: 'assistant_start';
  id: string;
  timestamp: number;
}

export interface TextDelta {
  type: 'text_delta';
  delta: string;
}

export interface ReasoningDelta {
  type: 'reasoning_delta';
  delta: string;
}

export interface ToolCallStart {
  type: 'tool_call_start';
  toolCall: ToolCallInfo;
}

export interface ToolCallComplete {
  type: 'tool_call_complete';
  id: string;
  result: unknown;
}

export interface PipelineEventMessage {
  type: 'pipeline_event';
  event: PipelineEvent;
  pipelineState: PipelineRunState;
}

export interface AssistantComplete {
  type: 'assistant_complete';
  id: string;
  content: string;
  thinking: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ApprovalRequired {
  type: 'approval_required';
  estimate: PipelineEstimate;
}

export interface ToolPermissionRequired {
  type: 'tool_permission_required';
  toolName: string;
  args: Record<string, unknown>;
}

export interface CostUpdate {
  type: 'cost_update';
  sessionCostUsd: number;
  budgetUsd: number;
}

export interface ProcessingState {
  type: 'processing';
  isProcessing: boolean;
}

export interface SystemMessage {
  type: 'system_message';
  text: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export interface SessionsListMessage {
  type: 'sessions_list';
  sessions: SessionSummary[];
}

export interface SessionResumedMessage {
  type: 'session_resumed';
  sessionId: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    thinking?: string;
    toolCalls?: ToolCallInfo[];
    pipelineState?: PipelineRunState;
    dryRunPreview?: DryRunPreviewData;
  }>;
  totalCostUsd: number;
}

export interface ModeChanged {
  type: 'mode_changed';
  mode: 'plan' | 'dry-run' | 'read-only';
  enabled: boolean;
}

export type ServerMessage =
  | InitMessage
  | UserMessageEcho
  | AssistantStart
  | TextDelta
  | ReasoningDelta
  | ToolCallStart
  | ToolCallComplete
  | PipelineEventMessage
  | AssistantComplete
  | ApprovalRequired
  | ToolPermissionRequired
  | CostUpdate
  | ProcessingState
  | SystemMessage
  | ErrorMessage
  | SessionsListMessage
  | SessionResumedMessage
  | ModeChanged;

// ── Helpers ──────────────────────────────────────────────────

export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    const result = ClientMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
