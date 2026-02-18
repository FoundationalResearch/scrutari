/**
 * Verification system types.
 *
 * The verification module extracts factual claims from analysis text,
 * links them to source data, performs number-matching checks, and
 * generates a report with footnotes and confidence scores.
 */

// ---------------------------------------------------------------------------
// Source references
// ---------------------------------------------------------------------------

/** A reference to a specific piece of source data that supports or contradicts a claim. */
export interface SourceReference {
  /** Identifier for the data source (e.g., 'edgar:10-K:2024', 'market-data:quote'). */
  sourceId: string;
  /** Human-readable label (e.g., '10-K filing (FY 2024)'). */
  label: string;
  /** Stage name that produced this source data. */
  stage: string;
  /** Relevant excerpt from the source data. */
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type ClaimStatus = 'verified' | 'unverified' | 'disputed' | 'error';

/** A factual claim extracted from analysis text. */
export interface Claim {
  /** Unique identifier within the report. */
  id: string;
  /** The claim text as it appears in the analysis. */
  text: string;
  /** Category: financial metric, event, comparison, projection, etc. */
  category: 'metric' | 'event' | 'comparison' | 'projection' | 'general';
  /** Verification status. */
  status: ClaimStatus;
  /** Confidence score 0-1 (1 = highest confidence). */
  confidence: number;
  /** Sources that support this claim. */
  sources: SourceReference[];
  /** Optional explanation of how the claim was verified. */
  reasoning?: string;
}

/** A numeric claim that can be checked with exact/approximate matching. */
export interface NumberClaim extends Claim {
  category: 'metric';
  /** The numeric value asserted by the claim. */
  value: number;
  /** Unit or qualifier (e.g., 'USD', '%', 'billion'). */
  unit: string;
  /** The value found in source data (if any). */
  sourceValue?: number;
  /** Whether the value matched the source (within tolerance). */
  matched?: boolean;
}

// ---------------------------------------------------------------------------
// Verification report
// ---------------------------------------------------------------------------

export interface VerificationSummary {
  totalClaims: number;
  verified: number;
  unverified: number;
  disputed: number;
  errors: number;
  overallConfidence: number;
}

export interface VerificationReport {
  /** All extracted claims. */
  claims: Claim[];
  /** Aggregate summary stats. */
  summary: VerificationSummary;
  /** The original analysis text that was verified. */
  analysisText: string;
  /** Analysis text annotated with footnote markers. */
  annotatedText: string;
  /** Footnotes (claim id → footnote text). */
  footnotes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Extractor / linker / reporter config
// ---------------------------------------------------------------------------

export interface ExtractorResult {
  claims: Claim[];
}

export interface LinkerResult {
  claims: Claim[];
  /** Number of claims that had sources linked. */
  linked: number;
}

export interface ReporterOptions {
  /** Whether to include the full annotated text. Default: true. */
  includeAnnotatedText?: boolean;
  /** Whether to include reasoning in footnotes. Default: true. */
  includeReasoning?: boolean;
}
