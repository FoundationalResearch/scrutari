import { describe, it, expect } from 'vitest';
import { SkillSchema } from './schema.js';

function makeMinimalSkill(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-skill',
    description: 'A test skill',
    stages: [
      { name: 'stage1', prompt: 'Do something' },
    ],
    output: { primary: 'stage1' },
    ...overrides,
  };
}

describe('SkillSchema', () => {
  it('accepts a valid minimal skill', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill());
    expect(result.success).toBe(true);
  });

  it('accepts a valid full skill with all fields', () => {
    const skill = {
      name: 'full-skill',
      version: '1.0',
      description: 'A full skill',
      author: 'tester',
      inputs: [
        { name: 'ticker', type: 'string', required: true, description: 'A ticker' },
        { name: 'count', type: 'number', required: false, default: 5 },
      ],
      tools_required: ['edgar'],
      tools_optional: ['news'],
      stages: [
        {
          name: 'gather',
          description: 'Gather data',
          model: 'claude-haiku-3-5-20241022',
          temperature: 0.5,
          tools: ['edgar'],
          prompt: 'Gather data for {ticker}',
          output_format: 'json',
          max_tokens: 4096,
        },
        {
          name: 'analyze',
          description: 'Analyze data',
          model: 'claude-sonnet-4-20250514',
          temperature: 1.0,
          prompt: 'Analyze the gathered data',
          output_format: 'markdown',
          input_from: ['gather'],
        },
      ],
      output: {
        primary: 'analyze',
        format: 'markdown',
        save_intermediate: true,
        filename_template: '{ticker}-report',
      },
    };
    const result = SkillSchema.safeParse(skill);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = SkillSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects empty stages array', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({ stages: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects temperature out of range', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [{ name: 's1', prompt: 'test', temperature: 3.0 }],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
  });

  it('rejects negative temperature', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [{ name: 's1', prompt: 'test', temperature: -0.1 }],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
  });

  it('rejects duplicate stage names', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 'dup', prompt: 'first' },
        { name: 'dup', prompt: 'second' },
      ],
      output: { primary: 'dup' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Duplicate stage name'))).toBe(true);
    }
  });

  it('rejects output.primary referencing non-existent stage', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      output: { primary: 'nonexistent' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('output.primary'))).toBe(true);
    }
  });

  it('rejects input_from referencing non-existent stage', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', prompt: 'test', input_from: ['unknown'] },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('unknown stage'))).toBe(true);
    }
  });

  it('rejects undeclared tools in stages', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_required: ['edgar'],
      stages: [
        { name: 's1', prompt: 'test', tools: ['edgar', 'secret-tool'] },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('undeclared tool'))).toBe(true);
    }
  });

  it('allows stage tools when no tool declarations exist', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', prompt: 'test', tools: ['any-tool'] },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(true);
  });

  it('rejects default value mismatching declared type', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      inputs: [
        { name: 'count', type: 'number', default: 'not-a-number' },
      ],
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('does not match type'))).toBe(true);
    }
  });

  it('rejects unknown fields in strict mode', () => {
    const result = SkillSchema.safeParse({
      ...makeMinimalSkill(),
      unknownField: 'surprise',
    });
    expect(result.success).toBe(false);
  });

  // --- tools_config tests ---

  it('accepts valid tools_config', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_required: ['sec-edgar', 'bloomberg/get_quote'],
      tools_optional: ['news'],
      tools_config: {
        'sec-edgar': { user_agent_email: 'analyst@example.com' },
        'bloomberg/get_quote': { fields: ['PX_LAST', 'VOLUME'] },
      },
      stages: [
        { name: 'stage1', prompt: 'test', tools: ['sec-edgar', 'bloomberg/get_quote'] },
      ],
      output: { primary: 'stage1' },
    }));
    expect(result.success).toBe(true);
  });

  it('accepts skill without tools_config', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_required: ['edgar'],
      stages: [
        { name: 'stage1', prompt: 'test', tools: ['edgar'] },
      ],
      output: { primary: 'stage1' },
    }));
    expect(result.success).toBe(true);
  });

  it('rejects tools_config referencing undeclared tool', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_required: ['edgar'],
      tools_config: {
        'edgar': { user_agent_email: 'test@example.com' },
        'unknown-tool': { key: 'value' },
      },
      stages: [
        { name: 'stage1', prompt: 'test', tools: ['edgar'] },
      ],
      output: { primary: 'stage1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('undeclared tool'))).toBe(true);
    }
  });

  it('allows tools_config without tool declarations', () => {
    // When no tools_required/optional exist, tools_config validation is skipped
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_config: {
        'some-tool': { key: 'value' },
      },
    }));
    expect(result.success).toBe(true);
  });

  // --- MCP tool references ---

  it('accepts MCP tool references in tools_required', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_required: ['sec-edgar', 'bloomberg/get_quote'],
      stages: [
        { name: 'stage1', prompt: 'test', tools: ['sec-edgar', 'bloomberg/get_quote'] },
      ],
      output: { primary: 'stage1' },
    }));
    expect(result.success).toBe(true);
  });

  // --- agent_type tests ---

  it('accepts valid agent_type on stages', () => {
    const types = ['research', 'explore', 'verify', 'default'] as const;
    for (const agentType of types) {
      const result = SkillSchema.safeParse(makeMinimalSkill({
        stages: [
          { name: 's1', prompt: 'test', agent_type: agentType },
        ],
        output: { primary: 's1' },
      }));
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid agent_type', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', prompt: 'test', agent_type: 'superagent' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
  });

  it('accepts stages without agent_type', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', prompt: 'test' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(true);
  });

  it('accepts MCP tool references in tools_optional', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      tools_optional: ['bloomberg/get_quote', 'custom-server/analyze'],
      stages: [
        { name: 'stage1', prompt: 'test', tools: ['bloomberg/get_quote'] },
      ],
      output: { primary: 'stage1' },
    }));
    expect(result.success).toBe(true);
  });

  // --- sub_pipeline / sub_inputs tests ---

  it('accepts stage with sub_pipeline and no prompt', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', sub_pipeline: 'deep-dive' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages[0].sub_pipeline).toBe('deep-dive');
      expect(result.data.stages[0].prompt).toBeUndefined();
    }
  });

  it('rejects stage with both prompt and sub_pipeline', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', prompt: 'Do something', sub_pipeline: 'deep-dive' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('cannot have both prompt and sub_pipeline'))).toBe(true);
    }
  });

  it('rejects stage with neither prompt nor sub_pipeline', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('must have either prompt or sub_pipeline'))).toBe(true);
    }
  });

  it('rejects sub_pipeline stage with model set', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', sub_pipeline: 'deep-dive', model: 'claude-haiku-3-5-20241022' },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('sub_pipeline stages should not set model'))).toBe(true);
    }
  });

  it('rejects sub_pipeline stage with tools set', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        { name: 's1', sub_pipeline: 'deep-dive', tools: ['edgar'] },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('sub_pipeline stages should not set tools'))).toBe(true);
    }
  });

  it('accepts sub_pipeline stage with sub_inputs', () => {
    const result = SkillSchema.safeParse(makeMinimalSkill({
      stages: [
        {
          name: 's1',
          sub_pipeline: 'deep-dive',
          sub_inputs: { ticker: 'AAPL', period: '2024-Q4' },
        },
      ],
      output: { primary: 's1' },
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages[0].sub_inputs).toEqual({ ticker: 'AAPL', period: '2024-Q4' });
    }
  });
});
