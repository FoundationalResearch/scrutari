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
  private _calls = 0;

  get totalSpent(): number {
    return this._spent;
  }

  get totalCalls(): number {
    return this._calls;
  }

  addCost(cost: number): void {
    this._spent += cost;
    this._calls++;
  }

  checkBudget(maxCostUsd: number): void {
    if (this._spent >= maxCostUsd) {
      throw new BudgetExceededError(this._spent, maxCostUsd);
    }
  }

  reset(): void {
    this._spent = 0;
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
