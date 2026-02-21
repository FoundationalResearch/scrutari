/**
 * Counting semaphore for limiting concurrency of async operations.
 * Uses a FIFO queue for waiters to ensure fair scheduling.
 */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    if (maxConcurrent < 1) {
      throw new Error('Semaphore maxConcurrent must be at least 1');
    }
    this.available = maxConcurrent;
  }

  /** Run `fn` with a semaphore slot. Waits if all slots are taken. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Transfer slot directly to next waiter (no decrement-then-increment race)
      next();
    } else {
      this.available++;
    }
  }
}
