import { describe, it, expect } from 'vitest';
import { Semaphore } from './semaphore.js';

describe('Semaphore', () => {
  it('throws if maxConcurrent is less than 1', () => {
    expect(() => new Semaphore(0)).toThrow('maxConcurrent must be at least 1');
    expect(() => new Semaphore(-1)).toThrow('maxConcurrent must be at least 1');
  });

  it('allows a single task to run immediately', async () => {
    const sem = new Semaphore(1);
    const result = await sem.run(async () => 42);
    expect(result).toBe(42);
  });

  it('limits concurrency to maxConcurrent', async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = () => sem.run(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 20));
      running--;
    });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);
  });

  it('runs all tasks even when queued', async () => {
    const sem = new Semaphore(1);
    const results: number[] = [];

    const makeTask = (n: number) => sem.run(async () => {
      results.push(n);
      return n;
    });

    const outcomes = await Promise.all([makeTask(1), makeTask(2), makeTask(3)]);
    expect(outcomes).toEqual([1, 2, 3]);
    expect(results).toHaveLength(3);
  });

  it('releases slot on error', async () => {
    const sem = new Semaphore(1);

    await expect(sem.run(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    // Slot should be released — next task should run
    const result = await sem.run(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('handles high concurrency limits', async () => {
    const sem = new Semaphore(100);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => sem.run(async () => i)),
    );
    expect(results).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('preserves FIFO order for waiters', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    // First task grabs the slot
    const blocker = sem.run(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      order.push(0);
    });

    // These queue up in order
    const t1 = sem.run(async () => { order.push(1); });
    const t2 = sem.run(async () => { order.push(2); });
    const t3 = sem.run(async () => { order.push(3); });

    await Promise.all([blocker, t1, t2, t3]);
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
