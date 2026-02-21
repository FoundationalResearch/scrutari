import { describe, it, expect } from 'vitest';
import { HooksFileSchema, HookDefinitionSchema } from './schema.js';

describe('HookDefinitionSchema', () => {
  it('accepts a valid hook with only command', () => {
    const result = HookDefinitionSchema.safeParse({ command: 'echo hello' });
    expect(result.success).toBe(true);
  });

  it('accepts a hook with all optional fields', () => {
    const result = HookDefinitionSchema.safeParse({
      command: 'echo hello',
      description: 'A test hook',
      stage: 'gather',
      tool: 'edgar_search_filings',
      timeout_ms: 5000,
      background: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('A test hook');
      expect(result.data.stage).toBe('gather');
      expect(result.data.tool).toBe('edgar_search_filings');
      expect(result.data.timeout_ms).toBe(5000);
      expect(result.data.background).toBe(true);
    }
  });

  it('rejects missing command', () => {
    const result = HookDefinitionSchema.safeParse({ description: 'no command' });
    expect(result.success).toBe(false);
  });

  it('rejects empty command', () => {
    const result = HookDefinitionSchema.safeParse({ command: '' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields due to strict()', () => {
    const result = HookDefinitionSchema.safeParse({
      command: 'echo hello',
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive timeout_ms', () => {
    const result = HookDefinitionSchema.safeParse({ command: 'echo', timeout_ms: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer timeout_ms', () => {
    const result = HookDefinitionSchema.safeParse({ command: 'echo', timeout_ms: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('HooksFileSchema', () => {
  it('accepts a valid hooks file', () => {
    const result = HooksFileSchema.safeParse({
      hooks: {
        post_pipeline: [{ command: 'echo done' }],
        session_start: [{ command: 'cat ~/.portfolio/positions.csv' }],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hooks.post_pipeline).toHaveLength(1);
      expect(result.data.hooks.session_start).toHaveLength(1);
    }
  });

  it('accepts an empty hooks object', () => {
    const result = HooksFileSchema.safeParse({ hooks: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hooks).toEqual({});
    }
  });

  it('defaults hooks to empty when omitted', () => {
    const result = HooksFileSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hooks).toEqual({});
    }
  });

  it('rejects invalid event names', () => {
    const result = HooksFileSchema.safeParse({
      hooks: {
        invalid_event: [{ command: 'echo' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra top-level fields due to strict()', () => {
    const result = HooksFileSchema.safeParse({
      hooks: {},
      extra: 'field',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid event names', () => {
    const result = HooksFileSchema.safeParse({
      hooks: {
        pre_pipeline: [{ command: 'echo 1' }],
        post_pipeline: [{ command: 'echo 2' }],
        pre_stage: [{ command: 'echo 3' }],
        post_stage: [{ command: 'echo 4' }],
        pre_tool: [{ command: 'echo 5' }],
        post_tool: [{ command: 'echo 6' }],
        session_start: [{ command: 'echo 7' }],
        session_end: [{ command: 'echo 8' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple hooks per event', () => {
    const result = HooksFileSchema.safeParse({
      hooks: {
        post_pipeline: [
          { command: 'echo first' },
          { command: 'echo second', background: true },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hooks.post_pipeline).toHaveLength(2);
    }
  });
});
