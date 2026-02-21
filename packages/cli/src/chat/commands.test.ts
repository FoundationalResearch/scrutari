import { describe, it, expect } from 'vitest';
import { parseSlashCommand } from './commands.js';

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello world')).toBeNull();
    expect(parseSlashCommand('analyze NVDA')).toBeNull();
    expect(parseSlashCommand('')).toBeNull();
  });

  it('parses /plan', () => {
    const result = parseSlashCommand('/plan');
    expect(result).toEqual({ type: 'plan', args: '', raw: '/plan' });
  });

  it('parses /plan with args', () => {
    const result = parseSlashCommand('/plan off');
    expect(result).toEqual({ type: 'plan', args: 'off', raw: '/plan off' });
  });

  it('parses /dry-run', () => {
    const result = parseSlashCommand('/dry-run');
    expect(result).toEqual({ type: 'dry-run', args: '', raw: '/dry-run' });
  });

  it('parses /dryrun as dry-run', () => {
    const result = parseSlashCommand('/dryrun');
    expect(result).toEqual({ type: 'dry-run', args: '', raw: '/dryrun' });
  });

  it('parses /help', () => {
    const result = parseSlashCommand('/help');
    expect(result).toEqual({ type: 'help', args: '', raw: '/help' });
  });

  it('returns unknown for unrecognized commands', () => {
    const result = parseSlashCommand('/foo');
    expect(result).toEqual({ type: 'unknown', args: '', raw: '/foo' });
  });

  it('returns unknown for unrecognized commands with args', () => {
    const result = parseSlashCommand('/bar baz qux');
    expect(result).toEqual({ type: 'unknown', args: 'baz qux', raw: '/bar baz qux' });
  });

  it('returns null for just a slash', () => {
    expect(parseSlashCommand('/')).toBeNull();
  });

  it('handles extra spaces around input', () => {
    const result = parseSlashCommand('  /plan  ');
    expect(result).toEqual({ type: 'plan', args: '', raw: '/plan' });
  });

  it('handles extra spaces between command and args', () => {
    const result = parseSlashCommand('/plan   off');
    expect(result).toEqual({ type: 'plan', args: 'off', raw: '/plan   off' });
  });

  it('is case-insensitive for commands', () => {
    const result = parseSlashCommand('/PLAN');
    expect(result).toEqual({ type: 'plan', args: '', raw: '/PLAN' });
  });

  it('is case-insensitive for DRY-RUN', () => {
    const result = parseSlashCommand('/DRY-RUN');
    expect(result).toEqual({ type: 'dry-run', args: '', raw: '/DRY-RUN' });
  });

  it('parses /persona', () => {
    const result = parseSlashCommand('/persona');
    expect(result).toEqual({ type: 'persona', args: '', raw: '/persona' });
  });

  it('parses /persona with name arg', () => {
    const result = parseSlashCommand('/persona investment-analyst');
    expect(result).toEqual({ type: 'persona', args: 'investment-analyst', raw: '/persona investment-analyst' });
  });

  it('parses /persona off', () => {
    const result = parseSlashCommand('/persona off');
    expect(result).toEqual({ type: 'persona', args: 'off', raw: '/persona off' });
  });

  it('parses /instruct', () => {
    const result = parseSlashCommand('/instruct');
    expect(result).toEqual({ type: 'instruct', args: '', raw: '/instruct' });
  });

  it('parses /instruct with text', () => {
    const result = parseSlashCommand('/instruct Focus on ESG metrics');
    expect(result).toEqual({ type: 'instruct', args: 'Focus on ESG metrics', raw: '/instruct Focus on ESG metrics' });
  });

  it('parses /instruct clear', () => {
    const result = parseSlashCommand('/instruct clear');
    expect(result).toEqual({ type: 'instruct', args: 'clear', raw: '/instruct clear' });
  });

  it('parses /context', () => {
    const result = parseSlashCommand('/context');
    expect(result).toEqual({ type: 'context', args: '', raw: '/context' });
  });

  it('parses /skills', () => {
    const result = parseSlashCommand('/skills');
    expect(result).toEqual({ type: 'skills', args: '', raw: '/skills' });
  });

  it('parses /compact', () => {
    const result = parseSlashCommand('/compact');
    expect(result).toEqual({ type: 'compact', args: '', raw: '/compact' });
  });

  it('parses /compact with instructions', () => {
    const result = parseSlashCommand('/compact keep all NVDA metrics');
    expect(result).toEqual({ type: 'compact', args: 'keep all NVDA metrics', raw: '/compact keep all NVDA metrics' });
  });

  it('parses /proceed', () => {
    const result = parseSlashCommand('/proceed');
    expect(result).toEqual({ type: 'proceed', args: '', raw: '/proceed' });
  });

  it('parses /proceed case-insensitively', () => {
    const result = parseSlashCommand('/PROCEED');
    expect(result).toEqual({ type: 'proceed', args: '', raw: '/PROCEED' });
  });

  it('parses /read-only', () => {
    const result = parseSlashCommand('/read-only');
    expect(result).toEqual({ type: 'read-only', args: '', raw: '/read-only' });
  });

  it('parses /readonly as read-only', () => {
    const result = parseSlashCommand('/readonly');
    expect(result).toEqual({ type: 'read-only', args: '', raw: '/readonly' });
  });

  it('parses /read-only with args', () => {
    const result = parseSlashCommand('/read-only off');
    expect(result).toEqual({ type: 'read-only', args: 'off', raw: '/read-only off' });
  });
});
