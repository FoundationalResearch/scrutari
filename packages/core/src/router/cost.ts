export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Pricing table for common models (USD per million tokens)
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-20250514':         { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-sonnet-4-20250514':       { inputPerMillion: 3.0,  outputPerMillion: 15.0 },
  'claude-haiku-3-5-20241022':      { inputPerMillion: 0.80, outputPerMillion: 4.0 },
  // OpenAI
  'gpt-4o':                         { inputPerMillion: 2.50, outputPerMillion: 10.0 },
  'gpt-4o-mini':                    { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'o1':                             { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  'o1-mini':                        { inputPerMillion: 3.0,  outputPerMillion: 12.0 },
  // Google Gemini
  'gemini-2.5-pro':                 { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gemini-2.5-flash':               { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gemini-2.0-flash':               { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  // MiniMax
  'MiniMax-M2':                     { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  'MiniMax-M2-Stable':              { inputPerMillion: 0.30, outputPerMillion: 1.20 },
};

// Conservative fallback pricing (sonnet-level) for unknown models
const FALLBACK_PRICING: ModelPricing = { inputPerMillion: 3.0, outputPerMillion: 15.0 };

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
}

export class CostTracker {
  private _spent = 0;
  private _reserved = 0;
  private _calls = 0;

  get totalSpent(): number {
    return this._spent;
  }

  /** Total committed cost: spent + reserved (for parallel budget safety). */
  get totalCommitted(): number {
    return this._spent + this._reserved;
  }

  get totalCalls(): number {
    return this._calls;
  }

  addCost(cost: number): void {
    this._spent += cost;
    this._calls++;
  }

  /**
   * Reserve estimated cost before starting an agent.
   * Throws BudgetExceededError if committed (spent + reserved) would exceed budget.
   */
  reserve(estimatedCost: number, maxCostUsd: number): void {
    if (this._spent + this._reserved + estimatedCost > maxCostUsd) {
      throw new BudgetExceededError(this._spent + this._reserved + estimatedCost, maxCostUsd);
    }
    this._reserved += estimatedCost;
  }

  /**
   * Finalize a reservation: swap the reserved amount for the actual cost.
   * Call after an agent completes to release its reservation and record actual spend.
   */
  finalize(reservedAmount: number, actualCost: number): void {
    this._reserved = Math.max(0, this._reserved - reservedAmount);
    this._spent += actualCost;
    this._calls++;
  }

  checkBudget(maxCostUsd: number): void {
    if (this.totalCommitted >= maxCostUsd) {
      throw new BudgetExceededError(this.totalCommitted, maxCostUsd);
    }
  }

  reset(): void {
    this._spent = 0;
    this._reserved = 0;
    this._calls = 0;
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly spent: number,
    public readonly budget: number,
  ) {
    super(`Budget exceeded: spent $${spent.toFixed(4)} of $${budget.toFixed(2)} budget`);
    this.name = 'BudgetExceededError';
  }
}
