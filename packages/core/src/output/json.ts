/**
 * Machine-readable JSON output formatter.
 *
 * Produces a structured JSON document with:
 * - Metadata (ticker, date, skill, model, cost, duration)
 * - Primary output summary
 * - Per-stage outputs with usage statistics
 * - Full verification data (claims, summary)
 */

import type { VerificationReport, Claim } from '../verification/types.js';
import type { Skill } from '../skills/types.js';

export interface JsonFormatOptions {
  /** The primary analysis output text. */
  primaryOutput: string;
  /** All stage outputs keyed by stage name. */
  outputs: Record<string, string>;
  /** Pipeline inputs (ticker, etc.). */
  inputs: Record<string, string | string[] | number | boolean>;
  /** The skill definition. */
  skill: Skill;
  /** Model used for the analysis. */
  model?: string;
  /** Total cost in USD. */
  totalCostUsd?: number;
  /** Total duration in milliseconds. */
  totalDurationMs?: number;
  /** Verification report (if verification ran). */
  verification?: VerificationReport;
  /** Per-stage usage data. */
  stageUsage?: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; model: string; durationMs: number }>;
}

export interface JsonOutputMetadata {
  ticker?: string;
  date: string;
  skill: string;
  skillVersion?: string;
  model?: string;
  cost?: number;
  durationMs?: number;
  durationFormatted?: string;
}

export interface JsonStageOutput {
  output: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
    durationMs: number;
  };
}

export interface JsonVerificationOutput {
  total: number;
  verified: number;
  unverified: number;
  disputed: number;
  errors: number;
  overallConfidence: number;
}

export interface JsonClaimOutput {
  id: string;
  text: string;
  category: string;
  status: string;
  confidence: number;
  reasoning?: string;
  sources: Array<{
    sourceId: string;
    label: string;
    stage: string;
  }>;
}

export interface JsonOutput {
  metadata: JsonOutputMetadata;
  summary: string;
  stages: Record<string, JsonStageOutput>;
  verification?: JsonVerificationOutput;
  claims?: JsonClaimOutput[];
}

/**
 * Format analysis results as a structured JSON document.
 */
export function formatJson(options: JsonFormatOptions): string {
  const {
    primaryOutput,
    outputs,
    inputs,
    skill,
    model,
    totalCostUsd,
    totalDurationMs,
    verification,
    stageUsage,
  } = options;

  const ticker = typeof inputs.ticker === 'string' ? inputs.ticker : undefined;

  const metadata: JsonOutputMetadata = {
    date: new Date().toISOString(),
    skill: skill.name,
  };
  if (ticker) metadata.ticker = ticker;
  if (skill.version) metadata.skillVersion = skill.version;
  if (model) metadata.model = model;
  if (totalCostUsd !== undefined) metadata.cost = Math.round(totalCostUsd * 10000) / 10000;
  if (totalDurationMs !== undefined) {
    metadata.durationMs = totalDurationMs;
    metadata.durationFormatted = formatDuration(totalDurationMs);
  }

  // Build stages map
  const stages: Record<string, JsonStageOutput> = {};
  for (const [stageName, content] of Object.entries(outputs)) {
    const stage: JsonStageOutput = { output: content };
    if (stageUsage && stageUsage[stageName]) {
      stage.usage = stageUsage[stageName];
    }
    stages[stageName] = stage;
  }

  const result: JsonOutput = {
    metadata,
    summary: extractSummary(primaryOutput),
    stages,
  };

  // Add verification data if available
  if (verification && verification.claims.length > 0) {
    result.verification = {
      total: verification.summary.totalClaims,
      verified: verification.summary.verified,
      unverified: verification.summary.unverified,
      disputed: verification.summary.disputed,
      errors: verification.summary.errors,
      overallConfidence: verification.summary.overallConfidence,
    };

    result.claims = verification.claims.map(serializeClaim);
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Extract a summary from the primary output.
 * Looks for an "Executive Summary" section or uses the first paragraph.
 */
function extractSummary(text: string): string {
  // Look for Executive Summary section
  const execSummaryMatch = text.match(
    /#+\s*Executive\s+Summary\s*\n+([\s\S]*?)(?=\n#+\s|\n---|\z)/i,
  );
  if (execSummaryMatch) {
    return execSummaryMatch[1].trim().substring(0, 2000);
  }

  // Look for Summary section
  const summaryMatch = text.match(
    /#+\s*Summary\s*\n+([\s\S]*?)(?=\n#+\s|\n---|\z)/i,
  );
  if (summaryMatch) {
    return summaryMatch[1].trim().substring(0, 2000);
  }

  // Fall back to first paragraph (skip headers)
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    if (trimmed === '') {
      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
      continue;
    }
    currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
  }
  if (currentParagraph) paragraphs.push(currentParagraph.trim());

  return paragraphs.length > 0 ? paragraphs[0].substring(0, 2000) : '';
}

function serializeClaim(claim: Claim): JsonClaimOutput {
  const result: JsonClaimOutput = {
    id: claim.id,
    text: claim.text,
    category: claim.category,
    status: claim.status,
    confidence: claim.confidence,
    sources: claim.sources.map(s => ({
      sourceId: s.sourceId,
      label: s.label,
      stage: s.stage,
    })),
  };

  if (claim.reasoning) {
    result.reasoning = claim.reasoning;
  }

  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
