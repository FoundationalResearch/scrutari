import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  getModelPricing,
  CostTracker,
  BudgetExceededError,
  MODEL_PRICING,
} from './cost.js';

describe('getModelPricing', () => {
  it('returns known pricing for Claude Sonnet', () => {
    const pricing = getModelPricing('claude-sonnet-4-20250514');
    expect(pricing.inputPerMillion).toBe(3.0);
    expect(pricing.outputPerMillion).toBe(15.0);
  });

  it('returns known pricing for GPT-4o', () => {
    const pricing = getModelPricing('gpt-4o');
    expect(pricing.inputPerMillion).toBe(2.5);
    expect(pricing.outputPerMillion).toBe(10.0);
  });

  it('returns known pricing for Claude Haiku', () => {
    const pricing = getModelPricing('claude-haiku-3-5-20241022');
    expect(pricing.inputPerMillion).toBe(0.8);
    expect(pricing.outputPerMillion).toBe(4.0);
  });

  it('returns fallback pricing for unknown models', () => {
    const pricing = getModelPricing('unknown-model-xyz');
    // Fallback = sonnet-level
    expect(pricing.inputPerMillion).toBe(3.0);
    expect(pricing.outputPerMillion).toBe(15.0);
  });

  it('returns known pricing for Gemini 2.5 Pro', () => {
    const pricing = getModelPricing('gemini-2.5-pro');
    expect(pricing.inputPerMillion).toBe(1.25);
    expect(pricing.outputPerMillion).toBe(10.0);
  });

  it('returns known pricing for Gemini 2.5 Flash', () => {
    const pricing = getModelPricing('gemini-2.5-flash');
    expect(pricing.inputPerMillion).toBe(0.15);
    expect(pricing.outputPerMillion).toBe(0.60);
  });

  it('returns known pricing for Gemini 2.0 Flash', () => {
    const pricing = getModelPricing('gemini-2.0-flash');
    expect(pricing.inputPerMillion).toBe(0.10);
    expect(pricing.outputPerMillion).toBe(0.40);
  });

  it('returns known pricing for MiniMax-M2', () => {
    const pricing = getModelPricing('MiniMax-M2');
    expect(pricing.inputPerMillion).toBe(0.30);
    expect(pricing.outputPerMillion).toBe(1.20);
  });

  it('returns known pricing for MiniMax-M2-Stable', () => {
    const pricing = getModelPricing('MiniMax-M2-Stable');
    expect(pricing.inputPerMillion).toBe(0.30);
    expect(pricing.outputPerMillion).toBe(1.20);
  });

  it('has pricing for all expected models', () => {
    const expected = [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-haiku-3-5-20241022',
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o1-mini',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'MiniMax-M2',
      'MiniMax-M2-Stable',
    ];
    for (const model of expected) {
      expect(MODEL_PRICING[model]).toBeDefined();
    }
  });
});

describe('calculateCost', () => {
  it('calculates cost for Claude Sonnet', () => {
    // 1000 input + 500 output at $3/$15 per million
    const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500);
    // (1000 * 3 + 500 * 15) / 1_000_000 = (3000 + 7500) / 1_000_000 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it('calculates cost for GPT-4o-mini', () => {
    const cost = calculateCost('gpt-4o-mini', 10_000, 5_000);
    // (10000 * 0.15 + 5000 * 0.60) / 1_000_000 = (1500 + 3000) / 1_000_000 = 0.0045
    expect(cost).toBeCloseTo(0.0045, 6);
  });

  it('calculates cost for Gemini 2.5 Flash', () => {
    const cost = calculateCost('gemini-2.5-flash', 10_000, 5_000);
    // (10000 * 0.15 + 5000 * 0.60) / 1_000_000 = (1500 + 3000) / 1_000_000 = 0.0045
    expect(cost).toBeCloseTo(0.0045, 6);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateCost('gpt-4o', 0, 0)).toBe(0);
  });

  it('uses fallback pricing for unknown model', () => {
    const cost = calculateCost('my-custom-model', 1_000_000, 0);
    // 1M input * $3/M = $3.00
    expect(cost).toBeCloseTo(3.0, 6);
  });
});

describe('CostTracker', () => {
  it('starts at zero', () => {
    const tracker = new CostTracker();
    expect(tracker.totalSpent).toBe(0);
    expect(tracker.totalCalls).toBe(0);
  });

  it('accumulates costs', () => {
    const tracker = new CostTracker();
    tracker.addCost(0.01);
    tracker.addCost(0.02);
    tracker.addCost(0.005);
    expect(tracker.totalSpent).toBeCloseTo(0.035, 6);
    expect(tracker.totalCalls).toBe(3);
  });

  it('resets to zero', () => {
    const tracker = new CostTracker();
    tracker.addCost(1.0);
    tracker.addCost(2.0);
    tracker.reset();
    expect(tracker.totalSpent).toBe(0);
    expect(tracker.totalCalls).toBe(0);
  });

  it('checkBudget does not throw when under budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(1.0);
    expect(() => tracker.checkBudget(5.0)).not.toThrow();
  });

  it('checkBudget throws BudgetExceededError when over budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(5.01);
    expect(() => tracker.checkBudget(5.0)).toThrow(BudgetExceededError);
  });

  it('checkBudget throws when exactly at budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(5.0);
    expect(() => tracker.checkBudget(5.0)).toThrow(BudgetExceededError);
  });

  // --- Reservation API ---

  it('totalCommitted includes spent + reserved', () => {
    const tracker = new CostTracker();
    tracker.addCost(1.0);
    tracker.reserve(0.5, 5.0);
    expect(tracker.totalSpent).toBe(1.0);
    expect(tracker.totalCommitted).toBeCloseTo(1.5, 6);
  });

  it('reserve throws when committed would exceed budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(4.0);
    expect(() => tracker.reserve(1.5, 5.0)).toThrow(BudgetExceededError);
  });

  it('reserve succeeds when within budget', () => {
    const tracker = new CostTracker();
    tracker.addCost(3.0);
    expect(() => tracker.reserve(1.5, 5.0)).not.toThrow();
    expect(tracker.totalCommitted).toBeCloseTo(4.5, 6);
  });

  it('finalize swaps reservation for actual cost', () => {
    const tracker = new CostTracker();
    tracker.reserve(2.0, 5.0);
    expect(tracker.totalCommitted).toBeCloseTo(2.0, 6);

    tracker.finalize(2.0, 1.5);
    expect(tracker.totalSpent).toBeCloseTo(1.5, 6);
    expect(tracker.totalCommitted).toBeCloseTo(1.5, 6);
    expect(tracker.totalCalls).toBe(1);
  });

  it('finalize clamps reserved to zero when over-releasing', () => {
    const tracker = new CostTracker();
    tracker.reserve(1.0, 5.0);
    tracker.finalize(5.0, 0.5); // Release more than reserved
    expect(tracker.totalSpent).toBeCloseTo(0.5, 6);
    expect(tracker.totalCommitted).toBeCloseTo(0.5, 6); // reserved is clamped to 0
  });

  it('checkBudget considers reserved amounts', () => {
    const tracker = new CostTracker();
    tracker.addCost(3.0);
    tracker.reserve(2.0, 5.0);
    expect(() => tracker.checkBudget(5.0)).toThrow(BudgetExceededError);
  });

  it('reset clears reservations too', () => {
    const tracker = new CostTracker();
    tracker.addCost(1.0);
    tracker.reserve(2.0, 5.0);
    tracker.reset();
    expect(tracker.totalSpent).toBe(0);
    expect(tracker.totalCommitted).toBe(0);
    expect(tracker.totalCalls).toBe(0);
  });

  it('multiple reserves accumulate', () => {
    const tracker = new CostTracker();
    tracker.reserve(1.0, 5.0);
    tracker.reserve(1.5, 5.0);
    expect(tracker.totalCommitted).toBeCloseTo(2.5, 6);
  });
});

describe('BudgetExceededError', () => {
  it('has correct properties', () => {
    const err = new BudgetExceededError(5.5, 5.0);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BudgetExceededError');
    expect(err.spent).toBe(5.5);
    expect(err.budget).toBe(5.0);
    expect(err.message).toContain('5.5');
    expect(err.message).toContain('5.00');
  });
});
