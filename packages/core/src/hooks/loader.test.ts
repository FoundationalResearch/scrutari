import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadHooksFile, HookLoadError, HookValidationError } from './loader.js';

// Mock fs and yaml
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockParseYaml = vi.mocked(parseYaml);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadHooksFile', () => {
  it('returns empty hooks when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadHooksFile('/nonexistent/hooks.yaml');
    expect(result).toEqual({ hooks: {} });
  });

  it('parses valid YAML hooks file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('hooks:\n  post_pipeline:\n    - command: echo done');
    mockParseYaml.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo done' }],
      },
    });

    const result = loadHooksFile('/path/to/hooks.yaml');
    expect(result.hooks.post_pipeline).toHaveLength(1);
    expect(result.hooks.post_pipeline![0].command).toBe('echo done');
  });

  it('throws HookLoadError when file cannot be read', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    expect(() => loadHooksFile('/path/to/hooks.yaml')).toThrow(HookLoadError);
    expect(() => loadHooksFile('/path/to/hooks.yaml')).toThrow('Failed to read hooks file');
  });

  it('throws HookLoadError when YAML is invalid', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('invalid: [yaml');
    mockParseYaml.mockImplementation(() => { throw new Error('bad yaml'); });

    expect(() => loadHooksFile('/path/to/hooks.yaml')).toThrow(HookLoadError);
    expect(() => loadHooksFile('/path/to/hooks.yaml')).toThrow('Failed to parse hooks YAML');
  });

  it('throws HookValidationError when schema validation fails', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('hooks:\n  bad_event:\n    - command: echo');
    mockParseYaml.mockReturnValue({
      hooks: {
        bad_event: [{ command: 'echo' }],
      },
    });

    expect(() => loadHooksFile('/path/to/hooks.yaml')).toThrow(HookValidationError);
  });

  it('returns empty hooks for null YAML content', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');
    mockParseYaml.mockReturnValue(null);

    const result = loadHooksFile('/path/to/hooks.yaml');
    expect(result).toEqual({ hooks: {} });
  });

  it('returns empty hooks for undefined YAML content', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');
    mockParseYaml.mockReturnValue(undefined);

    const result = loadHooksFile('/path/to/hooks.yaml');
    expect(result).toEqual({ hooks: {} });
  });

  it('uses default path when no path is provided', () => {
    mockExistsSync.mockReturnValue(false);
    loadHooksFile();
    expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('.scrutari/hooks.yaml'));
  });
});
