/**
 * Verification reporter — generates the final verification report
 * with annotated text, footnotes, and summary statistics.
 */

import type {
  Claim,
  VerificationReport,
  VerificationSummary,
  ReporterOptions,
} from './types.js';

export interface ReporterInput {
  claims: Claim[];
  analysisText: string;
  options?: ReporterOptions;
}

/**
 * Generate a VerificationReport from linked claims and the original analysis text.
 */
export function generateReport(input: ReporterInput): VerificationReport {
  const { claims, analysisText, options = {} } = input;
  const { includeAnnotatedText = true, includeReasoning = true } = options;

  const summary = computeSummary(claims);
  const footnotes = buildFootnotes(claims, includeReasoning);
  const annotatedText = includeAnnotatedText
    ? annotateText(analysisText, claims)
    : '';

  return {
    claims,
    summary,
    analysisText,
    annotatedText,
    footnotes,
  };
}

/**
 * Compute aggregate statistics from claims.
 */
export function computeSummary(claims: Claim[]): VerificationSummary {
  const total = claims.length;
  const verified = claims.filter(c => c.status === 'verified').length;
  const unverified = claims.filter(c => c.status === 'unverified').length;
  const disputed = claims.filter(c => c.status === 'disputed').length;
  const errors = claims.filter(c => c.status === 'error').length;

  // Overall confidence is the average of individual claim confidences
  const overallConfidence = total > 0
    ? claims.reduce((sum, c) => sum + c.confidence, 0) / total
    : 0;

  return {
    totalClaims: total,
    verified,
    unverified,
    disputed,
    errors,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}

/**
 * Build footnote text for each claim.
 */
function buildFootnotes(claims: Claim[], includeReasoning: boolean): Record<string, string> {
  const footnotes: Record<string, string> = {};

  for (const claim of claims) {
    const parts: string[] = [];

    // Status and confidence
    parts.push(`[${claim.status.toUpperCase()}] Confidence: ${Math.round(claim.confidence * 100)}%`);

    // Sources
    if (claim.sources.length > 0) {
      const sourceLabels = claim.sources.map(s => s.label).join('; ');
      parts.push(`Sources: ${sourceLabels}`);
    }

    // Reasoning
    if (includeReasoning && claim.reasoning) {
      parts.push(claim.reasoning);
    }

    footnotes[claim.id] = parts.join(' | ');
  }

  return footnotes;
}

/**
 * Annotate the analysis text with footnote markers [^claim-N] after matched claims.
 *
 * Strategy: for each claim, find its text in the analysis and insert a footnote
 * marker after the first occurrence. Process claims in reverse order of their
 * position in the text to avoid offset issues.
 */
export function annotateText(analysisText: string, claims: Claim[]): string {
  // Find positions of each claim in the text
  const insertions: Array<{ position: number; marker: string }> = [];

  for (const claim of claims) {
    const index = analysisText.indexOf(claim.text);
    if (index !== -1) {
      insertions.push({
        position: index + claim.text.length,
        marker: `[^${claim.id}]`,
      });
    } else {
      // Try partial match using first significant fragment
      const fragment = getMatchFragment(claim.text);
      if (fragment) {
        const fragIndex = analysisText.indexOf(fragment);
        if (fragIndex !== -1) {
          // Find the end of the sentence containing the fragment
          const sentenceEnd = findSentenceEnd(analysisText, fragIndex + fragment.length);
          insertions.push({
            position: sentenceEnd,
            marker: `[^${claim.id}]`,
          });
        }
      }
    }
  }

  // Sort by position descending so we can insert without offset issues
  insertions.sort((a, b) => b.position - a.position);

  let annotated = analysisText;
  for (const { position, marker } of insertions) {
    annotated = annotated.substring(0, position) + marker + annotated.substring(position);
  }

  return annotated;
}

/**
 * Get a fragment of claim text suitable for fuzzy matching in the analysis.
 * Uses the first clause or first ~60 characters.
 */
function getMatchFragment(claimText: string): string | null {
  // Try first clause (before comma or semicolon)
  const clauseMatch = claimText.match(/^(.{20,}?)[,;]/);
  if (clauseMatch) return clauseMatch[1];

  // Use first 60 characters
  if (claimText.length >= 20) return claimText.substring(0, 60);

  return claimText.length >= 10 ? claimText : null;
}

/**
 * Find the end of the sentence at or after the given position.
 */
function findSentenceEnd(text: string, afterPos: number): number {
  const sentenceEndPattern = /[.!?]/;
  for (let i = afterPos; i < text.length; i++) {
    if (sentenceEndPattern.test(text[i])) {
      return i + 1;
    }
  }
  // If no sentence end found, use end of line or end of text
  const newlinePos = text.indexOf('\n', afterPos);
  return newlinePos !== -1 ? newlinePos : text.length;
}

/**
 * Render the verification report as a markdown string.
 */
export function renderReportMarkdown(report: VerificationReport): string {
  const { summary, claims, footnotes, annotatedText } = report;
  const lines: string[] = [];

  // Summary section
  lines.push('## Verification Summary\n');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Claims | ${summary.totalClaims} |`);
  lines.push(`| Verified | ${summary.verified} |`);
  lines.push(`| Unverified | ${summary.unverified} |`);
  lines.push(`| Disputed | ${summary.disputed} |`);
  lines.push(`| Errors | ${summary.errors} |`);
  lines.push(`| Overall Confidence | ${Math.round(summary.overallConfidence * 100)}% |`);
  lines.push('');

  // Annotated text (if present)
  if (annotatedText) {
    lines.push('## Annotated Analysis\n');
    lines.push(annotatedText);
    lines.push('');
  }

  // Claims detail
  lines.push('## Claim Details\n');
  for (const claim of claims) {
    const statusIcon = getStatusIcon(claim.status);
    lines.push(`### ${statusIcon} ${claim.id}\n`);
    lines.push(`> ${claim.text}\n`);
    lines.push(`- **Category**: ${claim.category}`);
    lines.push(`- **Status**: ${claim.status}`);
    lines.push(`- **Confidence**: ${Math.round(claim.confidence * 100)}%`);
    if (claim.reasoning) {
      lines.push(`- **Reasoning**: ${claim.reasoning}`);
    }
    if (claim.sources.length > 0) {
      lines.push(`- **Sources**: ${claim.sources.map(s => s.label).join(', ')}`);
    }
    lines.push('');
  }

  // Footnotes
  if (Object.keys(footnotes).length > 0) {
    lines.push('## Footnotes\n');
    for (const [id, text] of Object.entries(footnotes)) {
      lines.push(`[^${id}]: ${text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'verified': return '[VERIFIED]';
    case 'unverified': return '[UNVERIFIED]';
    case 'disputed': return '[DISPUTED]';
    case 'error': return '[ERROR]';
    default: return '[UNKNOWN]';
  }
}

/**
 * Render verification report as a JSON object (for JSON output format).
 */
export function renderReportJSON(report: VerificationReport): string {
  return JSON.stringify({
    summary: report.summary,
    claims: report.claims.map(c => ({
      id: c.id,
      text: c.text,
      category: c.category,
      status: c.status,
      confidence: c.confidence,
      reasoning: c.reasoning,
      sources: c.sources.map(s => ({
        sourceId: s.sourceId,
        label: s.label,
        stage: s.stage,
      })),
    })),
  }, null, 2);
}
