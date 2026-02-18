/**
 * Claim extractor — uses an LLM to identify factual claims in analysis text.
 *
 * The extractor sends the analysis text to a model with a structured prompt
 * that asks it to identify specific factual claims (financial metrics, events,
 * comparisons, projections). The response is parsed into Claim objects.
 */

import type { LanguageModel } from 'ai';
import { callLLM } from '../router/llm.js';
import { CostTracker } from '../router/cost.js';
import type { Claim, ExtractorResult } from './types.js';

export interface ExtractorOptions {
  /** The analysis text to extract claims from. */
  analysisText: string;
  /** LLM model instance. */
  model: LanguageModel;
  /** Model ID string for cost tracking. */
  modelId: string;
  /** Budget tracking. */
  budget: { maxCostUsd: number; tracker: CostTracker };
  /** Max tokens for extraction response. */
  maxTokens?: number;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a verification assistant. Your task is to extract specific factual claims from financial analysis text.

For each claim, identify:
1. The exact claim text (as close to the original wording as possible)
2. The category: "metric" (specific numbers/figures), "event" (corporate events, dates), "comparison" (relative statements), "projection" (forward-looking), or "general" (other factual statements)
3. For metric claims: the numeric value and unit

Respond with a JSON array of claim objects. Each object should have:
- "text": string (the claim text)
- "category": "metric" | "event" | "comparison" | "projection" | "general"
- "value": number (only for metric claims)
- "unit": string (only for metric claims, e.g., "USD", "%", "billion", "million")

Focus on verifiable factual claims. Skip opinions, hedged statements, and general commentary.
Respond ONLY with the JSON array, no other text.`;

/**
 * Extract factual claims from analysis text using an LLM.
 */
export async function extractClaims(options: ExtractorOptions): Promise<ExtractorResult> {
  const { analysisText, model, modelId, budget, maxTokens } = options;

  const response = await callLLM({
    model,
    modelId,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extract all factual claims from the following analysis:\n\n${analysisText}`,
      },
    ],
    maxOutputTokens: maxTokens ?? 4096,
    temperature: 0.1,
    budget,
  });

  const claims = parseExtractionResponse(response.content);
  return { claims };
}

/**
 * Parse the LLM's JSON response into Claim objects.
 * Resilient to common formatting issues (markdown code fences, trailing commas).
 */
export function parseExtractionResponse(content: string): Claim[] {
  // Strip markdown code fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let rawClaims: unknown[];
  try {
    rawClaims = JSON.parse(jsonStr);
  } catch {
    // Try to extract JSON array from the response
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        rawClaims = JSON.parse(match[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (!Array.isArray(rawClaims)) return [];

  const claims: Claim[] = [];
  for (let i = 0; i < rawClaims.length; i++) {
    const raw = rawClaims[i] as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') continue;

    const text = typeof raw.text === 'string' ? raw.text : '';
    if (!text) continue;

    const category = validateCategory(raw.category);
    const id = `claim-${i + 1}`;

    const claim: Claim = {
      id,
      text,
      category,
      status: 'unverified',
      confidence: 0,
      sources: [],
    };

    // Attach numeric fields for metric claims
    if (category === 'metric' && typeof raw.value === 'number') {
      const numberClaim = claim as Claim & { value: number; unit: string };
      numberClaim.value = raw.value;
      numberClaim.unit = typeof raw.unit === 'string' ? raw.unit : '';
    }

    claims.push(claim);
  }

  return claims;
}

function validateCategory(cat: unknown): Claim['category'] {
  const valid = ['metric', 'event', 'comparison', 'projection', 'general'];
  if (typeof cat === 'string' && valid.includes(cat)) {
    return cat as Claim['category'];
  }
  return 'general';
}
