import { describe, it, expect } from 'vitest';
import type { SkillStage } from '../skills/types.js';
import {
  resolveAgentType,
  getAgentDefaults,
  AGENT_DEFAULTS,
  type AgentType,
} from './agent-types.js';

function makeStage(overrides: Partial<SkillStage> = {}): SkillStage {
  return {
    name: 'test-stage',
    prompt: 'Do something',
    ...overrides,
  };
}

describe('resolveAgentType', () => {
  it('returns explicit agent_type when set', () => {
    expect(resolveAgentType(makeStage({ agent_type: 'research' }))).toBe('research');
    expect(resolveAgentType(makeStage({ agent_type: 'explore' }))).toBe('explore');
    expect(resolveAgentType(makeStage({ agent_type: 'verify' }))).toBe('verify');
    expect(resolveAgentType(makeStage({ agent_type: 'default' }))).toBe('default');
  });

  it('infers verify from stage name "verify"', () => {
    expect(resolveAgentType(makeStage({ name: 'verify' }))).toBe('verify');
  });

  it('infers verify from stage name containing "verify"', () => {
    expect(resolveAgentType(makeStage({ name: 'verify_data' }))).toBe('verify');
    expect(resolveAgentType(makeStage({ name: 'cross-verify' }))).toBe('verify');
  });

  it('infers research for stage with tools and json output', () => {
    expect(resolveAgentType(makeStage({
      name: 'gather_data',
      tools: ['edgar'],
      output_format: 'json',
      input_from: ['prior'],
    }))).toBe('research');
  });

  it('infers explore for stage with tools and no input_from', () => {
    expect(resolveAgentType(makeStage({
      name: 'gather',
      tools: ['edgar', 'market-data'],
    }))).toBe('explore');
  });

  it('returns default for stage without tools or verify name', () => {
    expect(resolveAgentType(makeStage({ name: 'analyze' }))).toBe('default');
  });

  it('returns default for stage with tools and input_from but non-json output', () => {
    expect(resolveAgentType(makeStage({
      name: 'analyze',
      tools: ['edgar'],
      input_from: ['gather'],
      output_format: 'markdown',
    }))).toBe('default');
  });

  it('explicit agent_type overrides name-based inference', () => {
    expect(resolveAgentType(makeStage({
      name: 'verify_results',
      agent_type: 'research',
    }))).toBe('research');
  });

  it('returns explore for tools with empty input_from array', () => {
    expect(resolveAgentType(makeStage({
      name: 'scan',
      tools: ['news'],
      input_from: [],
    }))).toBe('explore');
  });
});

describe('getAgentDefaults', () => {
  it('returns built-in defaults when no overrides', () => {
    const defaults = getAgentDefaults('research');
    expect(defaults).toEqual(AGENT_DEFAULTS.research);
  });

  it('returns built-in defaults for each agent type', () => {
    const types: AgentType[] = ['research', 'explore', 'verify', 'default'];
    for (const type of types) {
      expect(getAgentDefaults(type)).toEqual(AGENT_DEFAULTS[type]);
    }
  });

  it('merges partial config overrides', () => {
    const defaults = getAgentDefaults('explore', {
      explore: { model: 'gpt-4o-mini', temperature: 0.2 },
    });
    expect(defaults.model).toBe('gpt-4o-mini');
    expect(defaults.temperature).toBe(0.2);
    // Unchanged fields keep defaults
    expect(defaults.maxTokens).toBe(AGENT_DEFAULTS.explore.maxTokens);
    expect(defaults.maxToolSteps).toBe(AGENT_DEFAULTS.explore.maxToolSteps);
  });

  it('ignores overrides for different agent types', () => {
    const defaults = getAgentDefaults('verify', {
      research: { model: 'gpt-4o' },
    });
    expect(defaults).toEqual(AGENT_DEFAULTS.verify);
  });

  it('returns a copy, not a reference to AGENT_DEFAULTS', () => {
    const defaults = getAgentDefaults('default');
    defaults.model = 'modified';
    expect(AGENT_DEFAULTS.default.model).toBe('claude-sonnet-4-20250514');
  });
});

describe('AGENT_DEFAULTS', () => {
  it('has entries for all 4 agent types', () => {
    expect(Object.keys(AGENT_DEFAULTS).sort()).toEqual(['default', 'explore', 'research', 'verify']);
  });

  it('explore uses a cheaper/faster model than research', () => {
    expect(AGENT_DEFAULTS.explore.model).toContain('haiku');
    expect(AGENT_DEFAULTS.research.model).toContain('sonnet');
  });

  it('explore has lower maxTokens than research', () => {
    expect(AGENT_DEFAULTS.explore.maxTokens).toBeLessThan(AGENT_DEFAULTS.research.maxTokens);
  });
});
