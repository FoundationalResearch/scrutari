import { describe, it, expect } from 'vitest';
import {
  linkClaims,
  extractKeywords,
  extractNumbers,
  numbersMatch,
  isNumberClaim,
} from './linker.js';
import type { Claim, NumberClaim } from './types.js';

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    text: 'Revenue was $50 billion in fiscal year 2024',
    category: 'metric',
    status: 'unverified',
    confidence: 0,
    sources: [],
    ...overrides,
  };
}

function makeNumberClaim(overrides: Partial<NumberClaim> = {}): NumberClaim {
  return {
    id: 'claim-1',
    text: 'Revenue was $50 billion',
    category: 'metric',
    status: 'unverified',
    confidence: 0,
    sources: [],
    value: 50,
    unit: 'billion',
    ...overrides,
  };
}

describe('extractKeywords', () => {
  it('extracts significant words', () => {
    const keywords = extractKeywords('Revenue was $50 billion in fiscal year 2024');
    expect(keywords).toContain('revenue');
    expect(keywords).toContain('billion');
    expect(keywords).toContain('fiscal');
    expect(keywords).toContain('year');
    expect(keywords).toContain('2024');
  });

  it('filters out stop words', () => {
    const keywords = extractKeywords('The company is a leader in the market');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('in');
    expect(keywords).toContain('company');
    expect(keywords).toContain('leader');
    expect(keywords).toContain('market');
  });

  it('deduplicates keywords', () => {
    const keywords = extractKeywords('revenue revenue revenue growth');
    expect(keywords.filter(k => k === 'revenue')).toHaveLength(1);
  });

  it('filters words shorter than 3 chars', () => {
    const keywords = extractKeywords('It is an OK deal');
    expect(keywords).not.toContain('it');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('an');
    expect(keywords).not.toContain('ok');
    expect(keywords).toContain('deal');
  });
});

describe('extractNumbers', () => {
  it('extracts simple integers', () => {
    const numbers = extractNumbers('The count is 42 and the total is 100');
    expect(numbers).toContain(42);
    expect(numbers).toContain(100);
  });

  it('extracts numbers with commas', () => {
    const numbers = extractNumbers('Revenue was 1,234,567');
    expect(numbers).toContain(1234567);
  });

  it('extracts decimal numbers', () => {
    const numbers = extractNumbers('EPS was 2.50 and margin was 15.3%');
    expect(numbers).toContain(2.5);
    expect(numbers).toContain(15.3);
  });

  it('extracts negative numbers', () => {
    const numbers = extractNumbers('Net loss of -500 million');
    expect(numbers).toContain(-500);
  });

  it('extracts numbers with billion/million suffixes', () => {
    const numbers = extractNumbers('Revenue was 50 billion');
    expect(numbers).toContain(50);
    expect(numbers).toContain(50_000_000_000);
  });

  it('handles B abbreviation', () => {
    const numbers = extractNumbers('$1.5B revenue');
    expect(numbers).toContain(1.5);
    expect(numbers).toContain(1_500_000_000);
  });

  it('handles M abbreviation', () => {
    const numbers = extractNumbers('$750M in sales');
    expect(numbers).toContain(750);
    expect(numbers).toContain(750_000_000);
  });
});

describe('numbersMatch', () => {
  it('matches identical numbers', () => {
    expect(numbersMatch(42, 42, 0.001)).toBe(true);
  });

  it('matches within tolerance', () => {
    // 100 vs 100.05 → 0.05% difference, within 0.1%
    expect(numbersMatch(100, 100.05, 0.001)).toBe(true);
  });

  it('rejects outside tolerance', () => {
    // 100 vs 101 → 1% difference, outside 0.1%
    expect(numbersMatch(100, 101, 0.001)).toBe(false);
  });

  it('handles zero values', () => {
    expect(numbersMatch(0, 0, 0.001)).toBe(true);
    expect(numbersMatch(0, 0.0005, 0.001)).toBe(true);
    expect(numbersMatch(0, 1, 0.001)).toBe(false);
  });

  it('handles negative numbers', () => {
    expect(numbersMatch(-100, -100.05, 0.001)).toBe(true);
    expect(numbersMatch(-100, -110, 0.001)).toBe(false);
  });
});

describe('isNumberClaim', () => {
  it('returns true for claims with metric category and value', () => {
    const claim = makeNumberClaim();
    expect(isNumberClaim(claim)).toBe(true);
  });

  it('returns false for non-metric claims', () => {
    const claim = makeClaim({ category: 'event' });
    expect(isNumberClaim(claim)).toBe(false);
  });

  it('returns false for metric claims without value field', () => {
    const claim = makeClaim({ category: 'metric' });
    expect(isNumberClaim(claim)).toBe(false);
  });
});

describe('linkClaims', () => {
  it('links claims to stage outputs with matching keywords', () => {
    const claim = makeClaim({
      text: 'Apple revenue was $383 billion in fiscal year 2023',
    });
    const stageOutputs = {
      gather: 'Apple Inc. reported annual revenue of $383 billion for fiscal year 2023.',
    };

    const result = linkClaims({ claims: [claim], stageOutputs });
    expect(result.linked).toBe(1);
    expect(claim.sources).toHaveLength(1);
    expect(claim.sources[0].stage).toBe('gather');
    expect(claim.sources[0].sourceId).toBe('stage:gather');
    expect(claim.status).toBe('verified');
  });

  it('matches number claims with exact integer match', () => {
    const claim = makeNumberClaim({ value: 383, unit: 'billion' });
    const stageOutputs = {
      gather: 'Revenue: 383 billion USD for the fiscal year.',
    };

    const result = linkClaims({ claims: [claim], stageOutputs });
    expect(claim.matched).toBe(true);
    expect(claim.status).toBe('verified');
    expect(claim.confidence).toBe(0.9);
    expect(claim.sourceValue).toBe(383);
  });

  it('matches decimal numbers within tolerance', () => {
    const claim = makeNumberClaim({ value: 2.50, unit: 'USD' });
    const stageOutputs = {
      extract: 'Earnings per share: $2.50',
    };

    const result = linkClaims({ claims: [claim], stageOutputs });
    expect(claim.matched).toBe(true);
    expect(claim.status).toBe('verified');
  });

  it('marks disputed when number does not match', () => {
    const claim = makeNumberClaim({ value: 200, unit: 'billion' });
    const stageOutputs = {
      gather: 'Revenue was 85 billion for the fiscal year.',
    };

    const result = linkClaims({ claims: [claim], stageOutputs });
    expect(claim.matched).toBe(false);
    expect(claim.status).toBe('disputed');
    expect(claim.confidence).toBe(0.3);
    expect(claim.sourceValue).toBeDefined();
  });

  it('returns linked count', () => {
    const claims = [
      makeClaim({ id: 'c1', text: 'Apple reported strong revenue growth in Q4' }),
      makeClaim({ id: 'c2', text: 'Something about quantum computing breakthroughs' }),
    ];
    const stageOutputs = {
      gather: 'Apple Inc. revenue growth accelerated in Q4 2024.',
    };

    const result = linkClaims({ claims, stageOutputs });
    expect(result.linked).toBeGreaterThanOrEqual(1);
  });

  it('handles empty claims array', () => {
    const result = linkClaims({ claims: [], stageOutputs: { gather: 'some data' } });
    expect(result.claims).toEqual([]);
    expect(result.linked).toBe(0);
  });

  it('handles empty stage outputs', () => {
    const claim = makeClaim();
    const result = linkClaims({ claims: [claim], stageOutputs: {} });
    expect(result.linked).toBe(0);
    expect(claim.status).toBe('unverified');
  });

  it('uses custom tolerance', () => {
    const claim = makeNumberClaim({ value: 100.5, unit: 'USD' });
    const stageOutputs = {
      gather: 'The value is 105.3.',
    };

    // ~4.8% difference — default tolerance (0.1%) would reject, but 10% accepts
    linkClaims({ claims: [claim], stageOutputs, tolerance: 0.1 });
    expect(claim.matched).toBe(true);
  });
});
