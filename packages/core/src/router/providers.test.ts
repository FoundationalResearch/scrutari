import { describe, it, expect } from 'vitest';
import { detectProvider, remapModelForProvider, ProviderRegistry } from './providers.js';

describe('detectProvider', () => {
  it('detects Anthropic models', () => {
    expect(detectProvider('claude-sonnet-4-20250514')).toBe('anthropic');
    expect(detectProvider('claude-opus-4-20250514')).toBe('anthropic');
    expect(detectProvider('claude-haiku-3-5-20241022')).toBe('anthropic');
  });

  it('detects OpenAI GPT models', () => {
    expect(detectProvider('gpt-4o')).toBe('openai');
    expect(detectProvider('gpt-4o-mini')).toBe('openai');
    expect(detectProvider('gpt-3.5-turbo')).toBe('openai');
  });

  it('detects OpenAI reasoning models', () => {
    expect(detectProvider('o1')).toBe('openai');
    expect(detectProvider('o1-mini')).toBe('openai');
    expect(detectProvider('o3-mini')).toBe('openai');
  });

  it('detects Google Gemini models', () => {
    expect(detectProvider('gemini-2.5-pro')).toBe('google');
    expect(detectProvider('gemini-2.5-flash')).toBe('google');
    expect(detectProvider('gemini-2.0-flash')).toBe('google');
  });

  it('detects MiniMax models', () => {
    expect(detectProvider('MiniMax-M2')).toBe('minimax');
    expect(detectProvider('MiniMax-M2-Stable')).toBe('minimax');
    expect(detectProvider('minimax-custom')).toBe('minimax');
  });

  it('throws for unknown model prefix', () => {
    expect(() => detectProvider('llama-3-70b')).toThrow('Cannot determine provider');
    expect(() => detectProvider('mistral-large')).toThrow('Cannot determine provider');
  });
});

describe('ProviderRegistry', () => {
  it('throws when Anthropic API key is missing', () => {
    const registry = new ProviderRegistry({
      providers: {},
    });
    expect(() => registry.getModel('claude-sonnet-4-20250514')).toThrow(
      'Anthropic API key not configured',
    );
  });

  it('throws when OpenAI API key is missing', () => {
    const registry = new ProviderRegistry({
      providers: {},
    });
    expect(() => registry.getModel('gpt-4o')).toThrow(
      'OpenAI API key not configured',
    );
  });

  it('creates Anthropic model when API key is provided', () => {
    const registry = new ProviderRegistry({
      providers: {
        anthropic: { apiKey: 'sk-ant-test-key' },
      },
    });
    // getModel should return a LanguageModel without throwing
    const model = registry.getModel('claude-sonnet-4-20250514');
    expect(model).toBeDefined();
  });

  it('creates OpenAI model when API key is provided', () => {
    const registry = new ProviderRegistry({
      providers: {
        openai: { apiKey: 'sk-openai-test-key' },
      },
    });
    const model = registry.getModel('gpt-4o');
    expect(model).toBeDefined();
  });

  it('throws when Google API key is missing', () => {
    const registry = new ProviderRegistry({
      providers: {},
    });
    expect(() => registry.getModel('gemini-2.5-flash')).toThrow(
      'Google API key not configured',
    );
  });

  it('creates Google model when API key is provided', () => {
    const registry = new ProviderRegistry({
      providers: {
        google: { apiKey: 'test-google-key' },
      },
    });
    const model = registry.getModel('gemini-2.5-flash');
    expect(model).toBeDefined();
  });

  it('throws when MiniMax API key is missing', () => {
    const registry = new ProviderRegistry({
      providers: {},
    });
    expect(() => registry.getModel('MiniMax-M2')).toThrow(
      'MiniMax API key not configured',
    );
  });

  it('creates MiniMax model when API key is provided', () => {
    const registry = new ProviderRegistry({
      providers: {
        minimax: { apiKey: 'test-minimax-key' },
      },
    });
    const model = registry.getModel('MiniMax-M2');
    expect(model).toBeDefined();
  });

  it('reuses provider instance (lazy initialization)', () => {
    const registry = new ProviderRegistry({
      providers: {
        anthropic: { apiKey: 'sk-ant-test-key' },
      },
    });
    const model1 = registry.getModel('claude-sonnet-4-20250514');
    const model2 = registry.getModel('claude-haiku-3-5-20241022');
    // Both should succeed without creating a new provider
    expect(model1).toBeDefined();
    expect(model2).toBeDefined();
  });

  describe('remapModel', () => {
    it('returns original model when provider has API key', () => {
      const registry = new ProviderRegistry({
        providers: {
          anthropic: { apiKey: 'sk-ant-test' },
        },
      });
      expect(registry.remapModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514');
      expect(registry.remapModel('claude-haiku-3-5-20241022')).toBe('claude-haiku-3-5-20241022');
    });

    it('remaps Anthropic fast model to OpenAI when only OpenAI key available', () => {
      const registry = new ProviderRegistry({
        providers: {
          openai: { apiKey: 'sk-openai-test' },
        },
      });
      expect(registry.remapModel('claude-haiku-3-5-20241022')).toBe('gpt-4o-mini');
    });

    it('remaps Anthropic standard model to OpenAI when only OpenAI key available', () => {
      const registry = new ProviderRegistry({
        providers: {
          openai: { apiKey: 'sk-openai-test' },
        },
      });
      expect(registry.remapModel('claude-sonnet-4-20250514')).toBe('gpt-4o');
    });

    it('remaps Anthropic models to Google when only Google key available', () => {
      const registry = new ProviderRegistry({
        providers: {
          google: { apiKey: 'test-google-key' },
        },
      });
      expect(registry.remapModel('claude-haiku-3-5-20241022')).toBe('gemini-2.5-flash');
      expect(registry.remapModel('claude-sonnet-4-20250514')).toBe('gemini-2.5-pro');
    });

    it('remaps OpenAI models to Anthropic when only Anthropic key available', () => {
      const registry = new ProviderRegistry({
        providers: {
          anthropic: { apiKey: 'sk-ant-test' },
        },
      });
      expect(registry.remapModel('gpt-4o')).toBe('claude-sonnet-4-20250514');
      expect(registry.remapModel('gpt-4o-mini')).toBe('claude-haiku-3-5-20241022');
    });

    it('returns original model when no providers have API keys', () => {
      const registry = new ProviderRegistry({
        providers: {},
      });
      expect(registry.remapModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514');
    });

    it('returns unknown model as-is', () => {
      const registry = new ProviderRegistry({
        providers: {
          openai: { apiKey: 'sk-openai-test' },
        },
      });
      expect(registry.remapModel('llama-3-70b')).toBe('llama-3-70b');
    });

    it('treats unknown model with known provider prefix as standard tier', () => {
      const registry = new ProviderRegistry({
        providers: {
          openai: { apiKey: 'sk-openai-test' },
        },
      });
      // A hypothetical future Claude model not in the tier map defaults to standard
      expect(registry.remapModel('claude-future-model')).toBe('gpt-4o');
    });

    it('prefers Anthropic over OpenAI when both available', () => {
      const registry = new ProviderRegistry({
        providers: {
          anthropic: { apiKey: 'sk-ant-test' },
          openai: { apiKey: 'sk-openai-test' },
        },
      });
      // Google model should remap to Anthropic (higher priority)
      expect(registry.remapModel('gemini-2.5-flash')).toBe('claude-haiku-3-5-20241022');
    });
  });
});

describe('remapModelForProvider', () => {
  it('returns original when provider has key', () => {
    expect(remapModelForProvider('claude-sonnet-4-20250514', {
      providers: { anthropic: { apiKey: 'key' } },
    })).toBe('claude-sonnet-4-20250514');
  });

  it('remaps to available provider', () => {
    expect(remapModelForProvider('claude-sonnet-4-20250514', {
      providers: { google: { apiKey: 'key' } },
    })).toBe('gemini-2.5-pro');
  });

  it('remaps premium tier correctly', () => {
    expect(remapModelForProvider('claude-opus-4-20250514', {
      providers: { openai: { apiKey: 'key' } },
    })).toBe('o1');
  });
});
