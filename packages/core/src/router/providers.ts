import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'minimax';

export interface ProviderConfig {
  providers: {
    anthropic?: { apiKey?: string };
    openai?: { apiKey?: string };
    google?: { apiKey?: string };
    minimax?: { apiKey?: string };
  };
}

// ---------------------------------------------------------------------------
// Model tier mapping — used to find equivalent models across providers
// ---------------------------------------------------------------------------

type ModelTier = 'fast' | 'standard' | 'premium';

const MODEL_TO_TIER: Record<string, ModelTier> = {
  // Anthropic
  'claude-haiku-3-5-20241022': 'fast',
  'claude-sonnet-4-20250514': 'standard',
  'claude-opus-4-20250514': 'premium',
  // OpenAI
  'gpt-4o-mini': 'fast',
  'gpt-4o': 'standard',
  'o1-mini': 'fast',
  'o1': 'premium',
  // Google
  'gemini-2.0-flash': 'fast',
  'gemini-2.5-flash': 'fast',
  'gemini-2.5-pro': 'standard',
  // MiniMax
  'MiniMax-M2': 'standard',
  'MiniMax-M2-Stable': 'standard',
};

const PROVIDER_TIER_MODELS: Record<ProviderId, Record<ModelTier, string>> = {
  anthropic: {
    fast: 'claude-haiku-3-5-20241022',
    standard: 'claude-sonnet-4-20250514',
    premium: 'claude-opus-4-20250514',
  },
  openai: {
    fast: 'gpt-4o-mini',
    standard: 'gpt-4o',
    premium: 'o1',
  },
  google: {
    fast: 'gemini-2.5-flash',
    standard: 'gemini-2.5-pro',
    premium: 'gemini-2.5-pro',
  },
  minimax: {
    fast: 'MiniMax-M2',
    standard: 'MiniMax-M2',
    premium: 'MiniMax-M2',
  },
};

const PROVIDER_PRIORITY: ProviderId[] = ['anthropic', 'openai', 'google', 'minimax'];

/**
 * Remap a model to an equivalent model from an available provider.
 * If the model's provider has an API key, returns the model as-is.
 * Otherwise, finds the model's capability tier and returns the equivalent
 * model from the first available provider.
 */
export function remapModelForProvider(modelId: string, config: ProviderConfig): string {
  let provider: ProviderId;
  try {
    provider = detectProvider(modelId);
  } catch {
    // Unknown model prefix — return as-is
    return modelId;
  }

  const hasKey = !!config.providers[provider]?.apiKey;
  if (hasKey) return modelId;

  const tier = MODEL_TO_TIER[modelId] ?? 'standard';

  for (const p of PROVIDER_PRIORITY) {
    if (config.providers[p]?.apiKey) {
      return PROVIDER_TIER_MODELS[p][tier];
    }
  }

  // No provider available — return original (will fail with a clear error at call time)
  return modelId;
}

/** Determine which provider a model string belongs to. */
export function detectProvider(modelId: string): ProviderId {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3')
  ) {
    return 'openai';
  }
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('MiniMax-') || modelId.startsWith('minimax-')) return 'minimax';
  throw new Error(`Cannot determine provider for model: ${modelId}`);
}

/**
 * Registry that lazily initialises AI SDK providers and hands out
 * LanguageModel instances by model-id string.
 */
export class ProviderRegistry {
  private config: ProviderConfig;
  private anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
  private openaiProvider: ReturnType<typeof createOpenAI> | null = null;
  private googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  private minimaxProvider: ReturnType<typeof createOpenAI> | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Remap a model to an equivalent from an available provider.
   * If the model's provider has an API key, returns it unchanged.
   */
  remapModel(modelId: string): string {
    return remapModelForProvider(modelId, this.config);
  }

  /** Return a LanguageModel for the given model-id, creating the provider lazily. */
  getModel(modelId: string): LanguageModel {
    const providerId = detectProvider(modelId);

    switch (providerId) {
      case 'anthropic': {
        if (!this.anthropicProvider) {
          const apiKey = this.config.providers.anthropic?.apiKey;
          if (!apiKey) {
            throw new Error(
              'Anthropic API key not configured. Set providers.anthropic.api_key in ~/.scrutari/config.yaml',
            );
          }
          this.anthropicProvider = createAnthropic({ apiKey });
        }
        return this.anthropicProvider(modelId);
      }
      case 'openai': {
        if (!this.openaiProvider) {
          const apiKey = this.config.providers.openai?.apiKey;
          if (!apiKey) {
            throw new Error(
              'OpenAI API key not configured. Set providers.openai.api_key in ~/.scrutari/config.yaml',
            );
          }
          this.openaiProvider = createOpenAI({ apiKey });
        }
        return this.openaiProvider(modelId);
      }
      case 'google': {
        if (!this.googleProvider) {
          const apiKey = this.config.providers.google?.apiKey;
          if (!apiKey) {
            throw new Error(
              'Google API key not configured. Set providers.google.api_key in ~/.scrutari/config.yaml',
            );
          }
          this.googleProvider = createGoogleGenerativeAI({ apiKey });
        }
        return this.googleProvider(modelId);
      }
      case 'minimax': {
        if (!this.minimaxProvider) {
          const apiKey = this.config.providers.minimax?.apiKey;
          if (!apiKey) {
            throw new Error(
              'MiniMax API key not configured. Set providers.minimax.api_key in ~/.scrutari/config.yaml or export MINIMAX_API_KEY',
            );
          }
          this.minimaxProvider = createOpenAI({
            apiKey,
            baseURL: 'https://api.minimax.io/v1',
          });
        }
        return this.minimaxProvider.chat(modelId);
      }
    }
  }
}
