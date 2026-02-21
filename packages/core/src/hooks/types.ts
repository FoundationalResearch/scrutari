export const HOOK_EVENTS = [
  'pre_pipeline', 'post_pipeline',
  'pre_stage', 'post_stage',
  'pre_tool', 'post_tool',
  'session_start', 'session_end',
] as const;

export type HookEvent = typeof HOOK_EVENTS[number];

export interface HookDefinition {
  command: string;
  description?: string;
  /** Filter: only run for this stage name (pre_stage/post_stage) */
  stage?: string;
  /** Filter: only run for this tool name (pre_tool/post_tool) */
  tool?: string;
  /** Timeout in milliseconds (default 30000) */
  timeout_ms?: number;
  /** Fire-and-forget — don't await completion */
  background?: boolean;
}

export interface HooksConfig {
  hooks: Partial<Record<HookEvent, HookDefinition[]>>;
}

export interface PipelineHookContext {
  skill_name: string;
  inputs: Record<string, unknown>;
  output_path?: string;
  summary?: string;
  total_cost_usd?: number;
  total_duration_ms?: number;
  stages_completed?: number;
  primary_output?: string;
}

export interface StageHookContext {
  stage_name: string;
  skill_name: string;
  model?: string;
  stage_index?: number;
  total_stages?: number;
  tokens?: number;
  cost?: number;
  duration_ms?: number;
  content?: string;
}

export interface ToolHookContext {
  tool_name: string;
  params?: unknown;
  success?: boolean;
  error?: string;
  duration_ms?: number;
}

export interface SessionHookContext {
  session_id: string;
  session_title?: string;
  total_cost_usd?: number;
  message_count?: number;
}

export interface HookExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export type HookContext = Record<string, unknown>;
