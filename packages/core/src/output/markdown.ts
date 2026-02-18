/**
 * Enhanced markdown output formatter.
 *
 * Produces a professional research memo with:
 * - YAML frontmatter (ticker, date, skill, model, cost, verification stats)
 * - Verification badges inline: ✓ verified, ⚠ flagged, ? unverified
 * - Financial metrics in markdown tables
 * - Source citations as footnotes
 */

import type { VerificationReport, ClaimStatus } from '../verification/types.js';
import type { Skill } from '../skills/types.js';

export interface MarkdownFormatOptions {
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
  stageUsage?: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; model: string }>;
}

/**
 * Format analysis results as an enhanced markdown document.
 */
export function formatMarkdown(options: MarkdownFormatOptions): string {
  const {
    primaryOutput,
    inputs,
    skill,
    model,
    totalCostUsd,
    totalDurationMs,
    verification,
    stageUsage,
  } = options;

  const lines: string[] = [];

  // YAML frontmatter
  lines.push(buildFrontmatter(inputs, skill, model, totalCostUsd, verification));

  // Main content — annotate with verification badges if available
  if (verification && verification.claims.length > 0) {
    lines.push(annotateWithBadges(primaryOutput, verification));
  } else {
    lines.push(primaryOutput);
  }

  // Verification summary section
  if (verification && verification.claims.length > 0) {
    lines.push('');
    lines.push(buildVerificationSection(verification));
  }

  // Execution metadata footer
  lines.push('');
  lines.push(buildMetadataFooter(skill, model, totalCostUsd, totalDurationMs, stageUsage));

  // Footnotes
  if (verification && verification.claims.length > 0) {
    lines.push('');
    lines.push(buildFootnotes(verification));
  }

  return lines.join('\n');
}

function buildFrontmatter(
  inputs: Record<string, string | string[] | number | boolean>,
  skill: Skill,
  model?: string,
  totalCostUsd?: number,
  verification?: VerificationReport,
): string {
  const date = new Date().toISOString().split('T')[0];
  const ticker = typeof inputs.ticker === 'string' ? inputs.ticker : undefined;

  const fields: string[] = [];
  fields.push('---');
  if (ticker) fields.push(`ticker: ${ticker}`);
  fields.push(`date: ${date}`);
  fields.push(`skill: ${skill.name}`);
  if (model) fields.push(`model: ${model}`);
  if (totalCostUsd !== undefined) fields.push(`cost: $${totalCostUsd.toFixed(2)}`);
  if (verification) {
    const { verified, totalClaims } = verification.summary;
    fields.push(`verified_claims: ${verified}/${totalClaims}`);
  }
  fields.push('---');
  fields.push('');

  return fields.join('\n');
}

function getStatusBadge(status: ClaimStatus): string {
  switch (status) {
    case 'verified': return '\u2713';
    case 'disputed': return '\u26A0';
    case 'unverified': return '?';
    case 'error': return '\u2717';
  }
}

/**
 * Insert verification badges into the analysis text near each claim.
 */
function annotateWithBadges(text: string, verification: VerificationReport): string {
  // Build insertion list: for each claim, find where it appears and insert a badge
  const insertions: Array<{ position: number; badge: string; claimId: string }> = [];

  for (const claim of verification.claims) {
    const index = text.indexOf(claim.text);
    if (index !== -1) {
      const badge = getStatusBadge(claim.status);
      insertions.push({
        position: index + claim.text.length,
        badge: ` ${badge}[^${claim.id}]`,
        claimId: claim.id,
      });
    } else {
      // Try partial matching on a significant fragment
      const fragment = claim.text.substring(0, Math.min(60, claim.text.length));
      if (fragment.length >= 15) {
        const fragIndex = text.indexOf(fragment);
        if (fragIndex !== -1) {
          const endOfSentence = findSentenceEnd(text, fragIndex + fragment.length);
          const badge = getStatusBadge(claim.status);
          insertions.push({
            position: endOfSentence,
            badge: ` ${badge}[^${claim.id}]`,
            claimId: claim.id,
          });
        }
      }
    }
  }

  // Sort by position descending to insert without offset issues
  insertions.sort((a, b) => b.position - a.position);

  // Deduplicate positions
  const seen = new Set<number>();
  let annotated = text;
  for (const { position, badge } of insertions) {
    if (seen.has(position)) continue;
    seen.add(position);
    annotated = annotated.substring(0, position) + badge + annotated.substring(position);
  }

  return annotated;
}

function findSentenceEnd(text: string, afterPos: number): number {
  for (let i = afterPos; i < text.length; i++) {
    if ('.!?'.includes(text[i])) return i + 1;
  }
  const nl = text.indexOf('\n', afterPos);
  return nl !== -1 ? nl : text.length;
}

function buildVerificationSection(verification: VerificationReport): string {
  const { summary, claims } = verification;
  const lines: string[] = [];

  lines.push('---');
  lines.push('');
  lines.push('## Verification Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Claims | ${summary.totalClaims} |`);
  lines.push(`| \u2713 Verified | ${summary.verified} |`);
  lines.push(`| \u26A0 Disputed | ${summary.disputed} |`);
  lines.push(`| ? Unverified | ${summary.unverified} |`);
  lines.push(`| Errors | ${summary.errors} |`);
  lines.push(`| Overall Confidence | ${Math.round(summary.overallConfidence * 100)}% |`);
  lines.push('');

  // Disputed claims detail (if any)
  const disputed = claims.filter(c => c.status === 'disputed');
  if (disputed.length > 0) {
    lines.push('### Disputed Claims');
    lines.push('');
    for (const claim of disputed) {
      lines.push(`- **${claim.id}**: ${claim.text}`);
      if (claim.reasoning) {
        lines.push(`  - ${claim.reasoning}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildMetadataFooter(
  skill: Skill,
  model?: string,
  totalCostUsd?: number,
  totalDurationMs?: number,
  stageUsage?: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; model: string }>,
): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push('');
  lines.push('## Execution Details');
  lines.push('');

  // Summary table
  lines.push('| Parameter | Value |');
  lines.push('|-----------|-------|');
  lines.push(`| Skill | ${skill.name} |`);
  if (model) lines.push(`| Model | ${model} |`);
  if (totalCostUsd !== undefined) lines.push(`| Total Cost | $${totalCostUsd.toFixed(4)} |`);
  if (totalDurationMs !== undefined) lines.push(`| Duration | ${formatDuration(totalDurationMs)} |`);
  lines.push(`| Stages | ${skill.stages.length} |`);
  lines.push('');

  // Per-stage usage table
  if (stageUsage && Object.keys(stageUsage).length > 0) {
    lines.push('### Stage Details');
    lines.push('');
    lines.push('| Stage | Model | Input Tokens | Output Tokens | Cost |');
    lines.push('|-------|-------|-------------|--------------|------|');
    for (const [stageName, usage] of Object.entries(stageUsage)) {
      lines.push(
        `| ${stageName} | ${usage.model} | ${usage.inputTokens.toLocaleString()} | ${usage.outputTokens.toLocaleString()} | $${usage.costUsd.toFixed(4)} |`,
      );
    }
    lines.push('');
  }

  lines.push(`*Generated by [scrutari](https://github.com/scrutari/scrutari) on ${new Date().toISOString().split('T')[0]}*`);

  return lines.join('\n');
}

function buildFootnotes(verification: VerificationReport): string {
  const lines: string[] = [];

  for (const claim of verification.claims) {
    const badge = getStatusBadge(claim.status);
    const confidence = Math.round(claim.confidence * 100);
    const parts: string[] = [`${badge} ${claim.status.toUpperCase()} (${confidence}%)`];

    if (claim.sources.length > 0) {
      parts.push(`Sources: ${claim.sources.map(s => s.label).join(', ')}`);
    }
    if (claim.reasoning) {
      parts.push(claim.reasoning);
    }

    lines.push(`[^${claim.id}]: ${parts.join(' — ')}`);
  }

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
