/**
 * Source linker — matches claims against source data from prior pipeline stages.
 *
 * The linker scans stage outputs for data that supports or contradicts each claim.
 * For NumberClaims, it performs exact matching (integers) or approximate matching
 * (0.1% tolerance for decimals) against numeric values found in source data.
 */

import type { Claim, NumberClaim, SourceReference, LinkerResult } from './types.js';

export interface LinkerOptions {
  /** Claims to link. */
  claims: Claim[];
  /** Map of stage name → stage output content. */
  stageOutputs: Record<string, string>;
  /** Tolerance for decimal number matching (default 0.001 = 0.1%). */
  tolerance?: number;
}

/** Default relative tolerance for decimal comparisons (0.1%). */
const DEFAULT_TOLERANCE = 0.001;

/**
 * Link claims to source data from pipeline stage outputs.
 * Updates claim status, confidence, and sources in-place and returns the result.
 */
export function linkClaims(options: LinkerOptions): LinkerResult {
  const { claims, stageOutputs, tolerance = DEFAULT_TOLERANCE } = options;
  let linked = 0;

  for (const claim of claims) {
    const sources = findSources(claim, stageOutputs);

    if (sources.length > 0) {
      claim.sources = sources;
      linked++;
    }

    // For metric claims, try number matching
    if (isNumberClaim(claim)) {
      const matched = matchNumber(claim, stageOutputs, tolerance);
      claim.matched = matched;
      if (matched) {
        claim.status = 'verified';
        claim.confidence = 0.9;
        claim.reasoning = `Numeric value ${claim.value} ${claim.unit} matched in source data (within ${tolerance * 100}% tolerance).`;
      } else if (claim.sourceValue !== undefined) {
        claim.status = 'disputed';
        claim.confidence = 0.3;
        claim.reasoning = `Claimed ${claim.value} ${claim.unit} but source shows ${claim.sourceValue} ${claim.unit}.`;
      }
    }

    // For non-metric claims with sources, mark as partially verified
    if (!isNumberClaim(claim) && sources.length > 0 && claim.status === 'unverified') {
      claim.status = 'verified';
      claim.confidence = 0.7;
      claim.reasoning = `Claim text found referenced in ${sources.length} source(s).`;
    }
  }

  return { claims, linked };
}

/**
 * Search stage outputs for text that supports a claim.
 * Uses keyword matching on significant terms from the claim text.
 */
function findSources(claim: Claim, stageOutputs: Record<string, string>): SourceReference[] {
  const sources: SourceReference[] = [];
  const keywords = extractKeywords(claim.text);

  if (keywords.length === 0) return sources;

  for (const [stageName, output] of Object.entries(stageOutputs)) {
    const matchResult = findBestExcerpt(output, keywords);
    if (matchResult) {
      sources.push({
        sourceId: `stage:${stageName}`,
        label: `${stageName} stage output`,
        stage: stageName,
        excerpt: matchResult,
      });
    }
  }

  return sources;
}

/**
 * Extract significant keywords from claim text.
 * Filters out common stop words and short words.
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'yet', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'its', 'their', 'this', 'that', 'these', 'those', 'it', 'he', 'she',
    'they', 'we', 'you', 'his', 'her', 'our', 'your', 'which', 'who',
    'whom', 'what', 'about', 'up',
  ]);

  const words = text
    .replace(/[^a-zA-Z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Find the best matching excerpt in a text for a set of keywords.
 * Returns the excerpt if enough keywords match, otherwise null.
 */
function findBestExcerpt(text: string, keywords: string[]): string | null {
  const lowerText = text.toLowerCase();
  const matchedKeywords = keywords.filter(kw => lowerText.includes(kw));

  // Require at least 40% of keywords to match (minimum 1)
  const threshold = Math.max(1, Math.ceil(keywords.length * 0.4));
  if (matchedKeywords.length < threshold) return null;

  // Find the section with the highest keyword density
  const lines = text.split('\n');
  let bestScore = 0;
  let bestStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const windowLines = lines.slice(i, i + 3).join('\n');
    const windowLower = windowLines.toLowerCase();
    const score = matchedKeywords.filter(kw => windowLower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // Return up to 3 lines around the best match
  const excerpt = lines.slice(bestStart, bestStart + 3).join('\n').trim();
  return excerpt.length > 500 ? excerpt.substring(0, 500) + '...' : excerpt;
}

/**
 * Check if a claim is a NumberClaim (has value and unit fields).
 */
export function isNumberClaim(claim: Claim): claim is NumberClaim {
  return claim.category === 'metric' && 'value' in claim && typeof (claim as NumberClaim).value === 'number';
}

/**
 * Match a numeric claim's value against numbers found in source data.
 *
 * - Integers: exact match required
 * - Decimals: relative tolerance (default 0.1%)
 */
function matchNumber(
  claim: NumberClaim,
  stageOutputs: Record<string, string>,
  tolerance: number,
): boolean {
  const targetValue = claim.value;
  const isInteger = Number.isInteger(targetValue);

  for (const [_stageName, output] of Object.entries(stageOutputs)) {
    const numbers = extractNumbers(output);

    for (const num of numbers) {
      if (isInteger) {
        // Exact match for integers
        if (num === targetValue) {
          claim.sourceValue = num;
          return true;
        }
      } else {
        // Relative tolerance for decimals
        if (numbersMatch(targetValue, num, tolerance)) {
          claim.sourceValue = num;
          return true;
        }
      }
    }
  }

  // If no match found, record the closest value as sourceValue
  let closestValue: number | undefined;
  let closestDiff = Infinity;

  for (const output of Object.values(stageOutputs)) {
    const numbers = extractNumbers(output);
    for (const num of numbers) {
      const diff = Math.abs(num - targetValue);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestValue = num;
      }
    }
  }

  if (closestValue !== undefined) {
    claim.sourceValue = closestValue;
  }

  return false;
}

/**
 * Check if two numbers match within a relative tolerance.
 */
export function numbersMatch(a: number, b: number, tolerance: number): boolean {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return Math.abs(a - b) < tolerance;
  const relativeDiff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  return relativeDiff <= tolerance;
}

/**
 * Extract all numbers from a text string.
 * Handles: 1234, 1,234, 12.34, 1,234.56, -123, $1.5B patterns.
 */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  // Match numbers with optional commas, decimal points, and negative signs
  const pattern = /-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const numStr = match[0].replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num) && isFinite(num)) {
      numbers.push(num);

      // Check for scale suffixes immediately following the number
      const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 10);
      const scaleMatch = afterMatch.match(/^\s*([BMTbmt](?:illion|n|rillion)?)/i);
      if (scaleMatch) {
        const scale = scaleMatch[1].charAt(0).toUpperCase();
        if (scale === 'B') numbers.push(num * 1_000_000_000);
        else if (scale === 'M') numbers.push(num * 1_000_000);
        else if (scale === 'T') numbers.push(num * 1_000_000_000_000);
      }
    }
  }

  return numbers;
}
