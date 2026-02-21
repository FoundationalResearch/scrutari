import { describe, it, expect } from 'vitest';
import { parseSkillCommand, buildSkillMessage } from './skill-command.js';

describe('parseSkillCommand', () => {
  it('returns match with exact skill name', () => {
    const result = parseSkillCommand('deep-dive', 'NVDA', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA' },
    });
  });

  it('matches via hyphen-stripped comparison', () => {
    const result = parseSkillCommand('deepdive', 'NVDA', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA' },
    });
  });

  it('parses --key value flags', () => {
    const result = parseSkillCommand('deep-dive', '--depth full --format json', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { depth: 'full', format: 'json' },
    });
  });

  it('parses positional arg combined with flags', () => {
    const result = parseSkillCommand('deep-dive', 'NVDA --depth full', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA', depth: 'full' },
    });
  });

  it('splits comma-separated positional into string[]', () => {
    const result = parseSkillCommand('comp-analysis', 'AAPL,NVDA,MSFT', ['comp-analysis']);
    expect(result).toEqual({
      skillName: 'comp-analysis',
      inputs: { _positional: ['AAPL', 'NVDA', 'MSFT'] },
    });
  });

  it('returns null when command does not match any skill', () => {
    const result = parseSkillCommand('unknown', '', ['deep-dive']);
    expect(result).toBeNull();
  });

  it('returns empty inputs when args is empty', () => {
    const result = parseSkillCommand('deep-dive', '', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: {},
    });
  });

  it('is case-insensitive for the command', () => {
    const result = parseSkillCommand('DEEP-DIVE', 'AAPL', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'AAPL' },
    });
  });

  it('matches first available skill from multiple options', () => {
    const result = parseSkillCommand('deep-dive', '', ['comp-analysis', 'deep-dive', 'thesis-gen']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: {},
    });
  });

  it('returns null when skill list is empty', () => {
    const result = parseSkillCommand('deep-dive', '', []);
    expect(result).toBeNull();
  });

  it('splits comma-separated flag values into string[]', () => {
    const result = parseSkillCommand('comp-analysis', '--tickers AAPL,NVDA,MSFT', ['comp-analysis']);
    expect(result).toEqual({
      skillName: 'comp-analysis',
      inputs: { tickers: ['AAPL', 'NVDA', 'MSFT'] },
    });
  });

  it('ignores a trailing flag with no value', () => {
    const result = parseSkillCommand('deep-dive', 'NVDA --verbose', ['deep-dive']);
    // --verbose has no following value, so it is not added to inputs
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA' },
    });
  });

  it('only consumes first non-flag token as positional', () => {
    // Second bare token after positional is consumed should be ignored
    const result = parseSkillCommand('deep-dive', 'NVDA extra', ['deep-dive']);
    expect(result).toEqual({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA' },
    });
  });
});

describe('buildSkillMessage', () => {
  it('builds message with skill name only when no inputs', () => {
    const msg = buildSkillMessage({ skillName: 'deep-dive', inputs: {} });
    expect(msg).toBe('Run the deep-dive skill');
  });

  it('includes positional value in the message', () => {
    const msg = buildSkillMessage({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA' },
    });
    expect(msg).toContain('deep-dive');
    expect(msg).toContain('NVDA');
    expect(msg).toContain('with inputs:');
  });

  it('includes flag key=value pairs in the message', () => {
    const msg = buildSkillMessage({
      skillName: 'deep-dive',
      inputs: { depth: 'full', format: 'json' },
    });
    expect(msg).toContain('depth=full');
    expect(msg).toContain('format=json');
  });

  it('joins array positional values with commas', () => {
    const msg = buildSkillMessage({
      skillName: 'comp-analysis',
      inputs: { _positional: ['AAPL', 'NVDA', 'MSFT'] },
    });
    expect(msg).toContain('AAPL, NVDA, MSFT');
  });

  it('joins array flag values with commas', () => {
    const msg = buildSkillMessage({
      skillName: 'comp-analysis',
      inputs: { tickers: ['AAPL', 'NVDA'] },
    });
    expect(msg).toContain('tickers=AAPL, NVDA');
  });

  it('includes both positional and flags in a single message', () => {
    const msg = buildSkillMessage({
      skillName: 'deep-dive',
      inputs: { _positional: 'NVDA', depth: 'full' },
    });
    expect(msg).toBe('Run the deep-dive skill with inputs: NVDA, depth=full');
  });
});
