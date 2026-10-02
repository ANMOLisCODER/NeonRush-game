/**
 * Minimal generic object pool. Avoids per-frame allocation/GC churn for
 * entities (obstacles, coins, power-ups) and particle records.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly activeSet = new Set<T>();
  private created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly onAcquire?: (item: T) => void,
    private readonly onRelease?: (item: T) => void,
    private readonly maxCount = 512,
  ) {}

  acquire(): T {
    let item = this.free.pop();
    if (item === undefined) {
      if (this.created >= this.maxCount) {
        // Absolute cap reached: recycle the oldest active item.
        const oldest = this.activeSet.values().next().value as T | undefined;
        if (oldest !== undefined) this.release(oldest);
      }
      item = this.factory();
      this.created++;
    }
    this.activeSet.add(item);
    this.onAcquire?.(item);
    return item;
  }

  release(item: T): void {
    if (!this.activeSet.delete(item)) return;
    this.onRelease?.(item);
    this.free.push(item);
  }

  releaseAll(): void {
    for (const item of [...this.activeSet]) this.release(item);
  }

  getActiveCount(): number {
    return this.activeSet.size;
  }

  getFreeCount(): number {
    return this.free.length;
  }

  forEachActive(fn: (item: T) => void): void {
    for (const item of this.activeSet) fn(item);
  }
}
