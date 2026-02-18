import { describe, it, expect } from 'vitest';
import { resolveModel, getRoutingTable, type ModelRoute } from './model-router.js';

describe('resolveModel', () => {
  it('routes extract+low to haiku', () => {
    expect(resolveModel({ task: 'extract', complexity: 'low' }))
      .toBe('claude-haiku-3-5-20241022');
  });

  it('routes extract+medium to haiku', () => {
    expect(resolveModel({ task: 'extract', complexity: 'medium' }))
      .toBe('claude-haiku-3-5-20241022');
  });

  it('routes extract+high to sonnet', () => {
    expect(resolveModel({ task: 'extract', complexity: 'high' }))
      .toBe('claude-sonnet-4-20250514');
  });

  it('routes analyze+any to sonnet', () => {
    expect(resolveModel({ task: 'analyze', complexity: 'low' }))
      .toBe('claude-sonnet-4-20250514');
    expect(resolveModel({ task: 'analyze', complexity: 'medium' }))
      .toBe('claude-sonnet-4-20250514');
    expect(resolveModel({ task: 'analyze', complexity: 'high' }))
      .toBe('claude-sonnet-4-20250514');
  });

  it('routes synthesize+any to sonnet', () => {
    expect(resolveModel({ task: 'synthesize', complexity: 'low' }))
      .toBe('claude-sonnet-4-20250514');
  });

  it('routes verify+any to sonnet', () => {
    expect(resolveModel({ task: 'verify', complexity: 'medium' }))
      .toBe('claude-sonnet-4-20250514');
  });

  it('routes format+low to haiku', () => {
    expect(resolveModel({ task: 'format', complexity: 'low' }))
      .toBe('claude-haiku-3-5-20241022');
  });

  it('routes format+medium to sonnet', () => {
    expect(resolveModel({ task: 'format', complexity: 'medium' }))
      .toBe('claude-sonnet-4-20250514');
  });

  it('routes format+high to sonnet', () => {
    expect(resolveModel({ task: 'format', complexity: 'high' }))
      .toBe('claude-sonnet-4-20250514');
  });

  describe('overrides', () => {
    it('globalOverride takes highest priority', () => {
      const route: ModelRoute = {
        task: 'extract',
        complexity: 'low',
        model: 'per-stage-model',
      };
      expect(resolveModel(route, 'gpt-4o')).toBe('gpt-4o');
    });

    it('per-stage model override takes priority over routing table', () => {
      const route: ModelRoute = {
        task: 'extract',
        complexity: 'low',
        model: 'o1-mini',
      };
      expect(resolveModel(route)).toBe('o1-mini');
    });

    it('falls through to routing table when no overrides', () => {
      const route: ModelRoute = {
        task: 'extract',
        complexity: 'low',
      };
      expect(resolveModel(route)).toBe('claude-haiku-3-5-20241022');
    });
  });
});

describe('getRoutingTable', () => {
  it('returns a copy of the routing table', () => {
    const table = getRoutingTable();
    expect(table.extract.low).toBe('claude-haiku-3-5-20241022');
    expect(table.analyze.high).toBe('claude-sonnet-4-20250514');

    // Mutating the copy should not affect the original
    table.extract.low = 'mutated';
    const fresh = getRoutingTable();
    expect(fresh.extract.low).toBe('claude-haiku-3-5-20241022');
  });

  it('contains all task types', () => {
    const table = getRoutingTable();
    expect(Object.keys(table).sort()).toEqual(
      ['analyze', 'extract', 'format', 'synthesize', 'verify'],
    );
  });

  it('contains all complexity levels for each task', () => {
    const table = getRoutingTable();
    for (const task of Object.values(table)) {
      expect(Object.keys(task).sort()).toEqual(['high', 'low', 'medium']);
    }
  });
});
