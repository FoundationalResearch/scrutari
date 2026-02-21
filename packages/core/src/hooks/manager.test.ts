import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookManager, getHookManager, resetHookManager } from './manager.js';

// Mock the loader
vi.mock('./loader.js', () => ({
  loadHooksFile: vi.fn(),
}));

import { loadHooksFile } from './loader.js';

const mockLoadHooksFile = vi.mocked(loadHooksFile);

beforeEach(() => {
  vi.clearAllMocks();
  resetHookManager();
});

describe('HookManager', () => {
  it('starts with no hooks', () => {
    const manager = new HookManager();
    expect(manager.hasHooks('pre_pipeline')).toBe(false);
    expect(manager.getHooks('pre_pipeline')).toEqual([]);
  });

  it('loads hooks from file', () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo done' }],
      },
    });

    const manager = new HookManager();
    manager.load();
    expect(manager.hasHooks('post_pipeline')).toBe(true);
    expect(manager.getHooks('post_pipeline')).toHaveLength(1);
  });

  it('hasHooks returns false for events with no hooks', () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo done' }],
      },
    });

    const manager = new HookManager();
    manager.load();
    expect(manager.hasHooks('pre_pipeline')).toBe(false);
    expect(manager.hasHooks('session_start')).toBe(false);
  });

  it('emit returns empty array when no hooks loaded', async () => {
    const manager = new HookManager();
    const results = await manager.emit('post_pipeline', {});
    expect(results).toEqual([]);
  });

  it('emit returns empty array for events with no hooks', async () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo done' }],
      },
    });

    const manager = new HookManager();
    manager.load();
    const results = await manager.emit('pre_pipeline', {});
    expect(results).toEqual([]);
  });

  it('emit executes hooks and returns results', async () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo hello' }],
      },
    });

    const manager = new HookManager();
    manager.load();
    const results = await manager.emit('post_pipeline', {});
    expect(results).toHaveLength(1);
    expect(results[0].stdout.trim()).toBe('hello');
  });

  it('calls onHookOutput callback', async () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'echo callback' }],
      },
    });

    const onHookOutput = vi.fn();
    const manager = new HookManager({ onHookOutput });
    manager.load();
    await manager.emit('post_pipeline', {});
    expect(onHookOutput).toHaveBeenCalledWith('post_pipeline', expect.objectContaining({ exitCode: 0 }));
  });

  it('calls onHookError for post-hook failures', async () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        post_pipeline: [{ command: 'exit 1' }],
      },
    });

    const onHookError = vi.fn();
    const manager = new HookManager({ onHookError });
    manager.load();

    // Post-hooks should not throw
    const results = await manager.emit('post_pipeline', {});
    expect(results).toHaveLength(1);
    expect(onHookError).toHaveBeenCalledOnce();
  });

  it('re-throws pre-hook failures', async () => {
    mockLoadHooksFile.mockReturnValue({
      hooks: {
        pre_pipeline: [{ command: 'exit 1' }],
      },
    });

    const manager = new HookManager();
    manager.load();

    await expect(manager.emit('pre_pipeline', {})).rejects.toThrow();
  });

  it('load can be called multiple times (replaces config)', () => {
    mockLoadHooksFile
      .mockReturnValueOnce({ hooks: { post_pipeline: [{ command: 'echo first' }] } })
      .mockReturnValueOnce({ hooks: { session_start: [{ command: 'echo second' }] } });

    const manager = new HookManager();
    manager.load();
    expect(manager.hasHooks('post_pipeline')).toBe(true);

    manager.load();
    expect(manager.hasHooks('post_pipeline')).toBe(false);
    expect(manager.hasHooks('session_start')).toBe(true);
  });
});

describe('singleton', () => {
  it('getHookManager returns a singleton', () => {
    const a = getHookManager();
    const b = getHookManager();
    expect(a).toBe(b);
  });

  it('resetHookManager clears the singleton', () => {
    const a = getHookManager();
    resetHookManager();
    const b = getHookManager();
    expect(a).not.toBe(b);
  });
});
