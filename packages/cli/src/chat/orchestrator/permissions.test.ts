import { describe, it, expect } from 'vitest';
import { resolvePermission } from './permissions.js';

describe('resolvePermission', () => {
  it('returns auto when no permissions configured', () => {
    expect(resolvePermission('run_pipeline', {})).toBe('auto');
  });

  it('returns exact match level', () => {
    expect(resolvePermission('run_pipeline', { run_pipeline: 'confirm' })).toBe('confirm');
    expect(resolvePermission('run_pipeline', { run_pipeline: 'deny' })).toBe('deny');
    expect(resolvePermission('run_pipeline', { run_pipeline: 'auto' })).toBe('auto');
  });

  it('exact match takes precedence over glob', () => {
    const permissions = {
      'mcp.*': 'deny' as const,
      'mcp/get_quote': 'auto' as const,
    };
    expect(resolvePermission('mcp/get_quote', permissions)).toBe('auto');
  });

  it('matches glob pattern mcp.* for mcp/ prefixed tools', () => {
    expect(resolvePermission('mcp/get_quote', { 'mcp.*': 'confirm' })).toBe('confirm');
    expect(resolvePermission('mcp/search_news', { 'mcp.*': 'deny' })).toBe('deny');
  });

  it('matches glob pattern mcp.* for mcp_ prefixed tools', () => {
    expect(resolvePermission('mcp_get_quote', { 'mcp.*': 'confirm' })).toBe('confirm');
  });

  it('returns auto for unmatched tool', () => {
    const permissions = {
      run_pipeline: 'confirm' as const,
      'mcp.*': 'deny' as const,
    };
    expect(resolvePermission('get_quote', permissions)).toBe('auto');
  });

  it('does not match partial prefix without separator', () => {
    expect(resolvePermission('mcptools', { 'mcp.*': 'deny' })).toBe('auto');
  });
});
