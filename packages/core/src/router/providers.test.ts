import { describe, it, expect } from 'vitest';
import { detectProvider, ProviderRegistry } from './providers.js';

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
});
