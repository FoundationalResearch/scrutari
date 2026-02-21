import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { loadInstructions } from './instructions.js';

// Mock fs and os
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { readFileSync, existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadInstructions', () => {
  it('returns empty instructions when no files exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadInstructions('/project');
    expect(result).toEqual({ global: undefined, project: undefined, local: undefined });
  });

  it('loads global SCRUTARI.md from ~/.scrutari/', () => {
    mockExistsSync.mockImplementation((path) => {
      return path === resolve('/home/testuser', '.scrutari', 'SCRUTARI.md');
    });
    mockReadFileSync.mockReturnValue('Global instructions here');

    const result = loadInstructions('/project');
    expect(result.global).toBe('Global instructions here');
    expect(result.project).toBeUndefined();
  });

  it('loads project SCRUTARI.md from cwd', () => {
    mockExistsSync.mockImplementation((path) => {
      return path === resolve('/project', 'SCRUTARI.md');
    });
    mockReadFileSync.mockReturnValue('Project instructions');

    const result = loadInstructions('/project');
    expect(result.project).toBe('Project instructions');
    expect(result.global).toBeUndefined();
  });

  it('loads project SCRUTARI.md from .scrutari/ subfolder', () => {
    mockExistsSync.mockImplementation((path) => {
      return path === resolve('/project', '.scrutari/SCRUTARI.md');
    });
    mockReadFileSync.mockReturnValue('Project from subfolder');

    const result = loadInstructions('/project');
    expect(result.project).toBe('Project from subfolder');
  });

  it('prefers root SCRUTARI.md over .scrutari/SCRUTARI.md for project', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path) => {
      if (String(path).endsWith('/project/SCRUTARI.md')) return 'Root level';
      return 'Subfolder level';
    });

    const result = loadInstructions('/project');
    expect(result.project).toBe('Root level');
  });

  it('loads both global and project instructions', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path) => {
      if (String(path).includes('.scrutari/SCRUTARI.md') && String(path).startsWith('/home')) return 'Global';
      if (String(path).endsWith('/project/SCRUTARI.md')) return 'Project';
      return '';
    });

    const result = loadInstructions('/project');
    expect(result.global).toBe('Global');
    expect(result.project).toBe('Project');
  });

  it('returns undefined for empty files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('   \n  ');

    const result = loadInstructions('/project');
    expect(result.global).toBeUndefined();
  });

  it('handles read errors gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('permission denied'); });

    const result = loadInstructions('/project');
    expect(result.global).toBeUndefined();
    expect(result.project).toBeUndefined();
  });

  it('loads SCRUTARI.local.md from cwd', () => {
    mockExistsSync.mockImplementation((path) => {
      return path === resolve('/project', 'SCRUTARI.local.md');
    });
    mockReadFileSync.mockReturnValue('Local overrides');

    const result = loadInstructions('/project');
    expect(result.local).toBe('Local overrides');
    expect(result.global).toBeUndefined();
    expect(result.project).toBeUndefined();
  });

  it('returns undefined for local when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadInstructions('/project');
    expect(result.local).toBeUndefined();
  });

  it('loads all three tiers together', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path) => {
      const p = String(path);
      if (p.includes('.scrutari/SCRUTARI.md') && p.startsWith('/home')) return 'Global';
      if (p.endsWith('/project/SCRUTARI.md')) return 'Project';
      if (p.endsWith('/project/SCRUTARI.local.md')) return 'Local';
      return '';
    });

    const result = loadInstructions('/project');
    expect(result.global).toBe('Global');
    expect(result.project).toBe('Project');
    expect(result.local).toBe('Local');
  });
});
