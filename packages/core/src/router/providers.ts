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
