import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the throttling logic directly by simulating what the hook does
// internally: buffer updates in a map, merge on same ID, flush via interval.

interface PendingBuffer {
  pending: Map<string, Record<string, unknown>>;
}

function createBuffer(): PendingBuffer {
  return { pending: new Map() };
}

function bufferUpdate(
  buf: PendingBuffer,
  id: string,
  update: Record<string, unknown>,
): void {
  const existing = buf.pending.get(id);
  buf.pending.set(id, existing ? { ...existing, ...update } : { ...update });
}

function flush(
  buf: PendingBuffer,
  updateMessage: (id: string, update: Record<string, unknown>) => void,
): void {
  if (buf.pending.size === 0) return;
  for (const [id, update] of buf.pending) {
    updateMessage(id, update);
  }
  buf.pending.clear();
}

describe('useThrottledUpdate logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers updates without calling updateMessage immediately', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'hello' });
    bufferUpdate(buf, 'msg-1', { content: 'hello world' });

    expect(updateMessage).not.toHaveBeenCalled();
    expect(buf.pending.size).toBe(1);
  });

  it('flush sends all buffered updates', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'hello' });
    bufferUpdate(buf, 'msg-2', { content: 'world' });

    flush(buf, updateMessage);

    expect(updateMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { content: 'hello' });
    expect(updateMessage).toHaveBeenCalledWith('msg-2', { content: 'world' });
  });

  it('flush clears the buffer', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'hello' });
    flush(buf, updateMessage);

    expect(buf.pending.size).toBe(0);

    // Second flush is a no-op
    flush(buf, updateMessage);
    expect(updateMessage).toHaveBeenCalledTimes(1);
  });

  it('merges multiple updates to the same message ID', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'hello' });
    bufferUpdate(buf, 'msg-1', { thinking: 'reasoning about...' });
    bufferUpdate(buf, 'msg-1', { content: 'hello world' });

    flush(buf, updateMessage);

    expect(updateMessage).toHaveBeenCalledTimes(1);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', {
      content: 'hello world',
      thinking: 'reasoning about...',
    });
  });

  it('keeps updates to different IDs separate', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'first' });
    bufferUpdate(buf, 'msg-2', { content: 'second' });

    flush(buf, updateMessage);

    expect(updateMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { content: 'first' });
    expect(updateMessage).toHaveBeenCalledWith('msg-2', { content: 'second' });
  });

  it('interval-based flushing reduces update frequency', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();
    const intervalMs = 100;

    // Simulate interval-based flushing
    const timer = setInterval(() => flush(buf, updateMessage), intervalMs);

    // Simulate rapid streaming: 20 updates in 100ms
    for (let i = 0; i < 20; i++) {
      bufferUpdate(buf, 'msg-1', { content: `chunk-${i}` });
    }

    // After 100ms, only one flush should happen
    vi.advanceTimersByTime(100);
    expect(updateMessage).toHaveBeenCalledTimes(1);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { content: 'chunk-19' });

    // Simulate 20 more updates
    for (let i = 20; i < 40; i++) {
      bufferUpdate(buf, 'msg-1', { content: `chunk-${i}` });
    }

    // After another 100ms, second flush
    vi.advanceTimersByTime(100);
    expect(updateMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { content: 'chunk-39' });

    clearInterval(timer);
  });

  it('flush is a no-op when buffer is empty', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    flush(buf, updateMessage);

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('later values overwrite earlier ones for the same key', () => {
    const updateMessage = vi.fn();
    const buf = createBuffer();

    bufferUpdate(buf, 'msg-1', { content: 'a', thinking: 'x' });
    bufferUpdate(buf, 'msg-1', { content: 'b' });

    flush(buf, updateMessage);

    // 'content' should be 'b' (overwritten), 'thinking' should be 'x' (preserved)
    expect(updateMessage).toHaveBeenCalledWith('msg-1', {
      content: 'b',
      thinking: 'x',
    });
  });
});
