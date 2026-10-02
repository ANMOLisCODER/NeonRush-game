import { describe, expect, it } from 'vitest';
import { ChunkGenerator, isSequenceValid } from '../src/world/ChunkGenerator';
import { ObjectPool } from '../src/systems/ObjectPool';
import { clamp, damp, lerp, mulberry32 } from '../src/utils/math';

describe('ChunkGenerator', () => {
  it('starts with gentle open track', () => {
    const gen = new ChunkGenerator(mulberry32(1));
    expect(gen.next(0)).toBe('open');
    expect(gen.next(1)).toBe('open');
    expect(gen.next(2)).toBe('open');
  });

  it('never repeats a type three times in a row and never doubles tunnels (fuzz)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const gen = new ChunkGenerator(mulberry32(seed));
      const seq = Array.from({ length: 220 }, (_, i) => gen.next(i));
      expect(isSequenceValid(seq), `seed ${seed}`).toBe(true);
    }
  });

  it('produces visual variety (all six chunk types appear over 300 chunks)', () => {
    const gen = new ChunkGenerator(mulberry32(77));
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(gen.next(i));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('same seed produces the identical sequence', () => {
    const a = new ChunkGenerator(mulberry32(2026));
    const b = new ChunkGenerator(mulberry32(2026));
    for (let i = 0; i < 100; i++) {
      expect(a.next(i)).toBe(b.next(i));
      expect(a.nextVariant()).toBe(b.nextVariant());
    }
  });
});

describe('ObjectPool', () => {
  it('reuses released instances instead of creating new ones', () => {
    let created = 0;
    const pool = new ObjectPool<{ id: number }>(() => ({ id: created++ }));
    const a = pool.acquire();
    const b = pool.acquire();
    expect(created).toBe(2);
    pool.release(a);
    const c = pool.acquire();
    expect(c).toBe(a); // same object recycled
    expect(created).toBe(2);
    pool.release(b);
    pool.release(c);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(2);
  });

  it('releaseAll empties the active set', () => {
    const pool = new ObjectPool<number[]>(() => []);
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
  });

  it('double release is ignored', () => {
    const pool = new ObjectPool<number[]>(() => []);
    const item = pool.acquire();
    pool.release(item);
    pool.release(item);
    expect(pool.getFreeCount()).toBe(1);
  });

  it('forEachActive visits only active items', () => {
    const pool = new ObjectPool<{ v: number }>(() => ({ v: 0 }));
    const a = pool.acquire();
    a.v = 5;
    const b = pool.acquire();
    b.v = 7;
    pool.release(b);
    const seen: number[] = [];
    pool.forEachActive((i) => seen.push(i.v));
    expect(seen).toEqual([5]);
  });
});

describe('math utils', () => {
  it('clamp / lerp behave correctly', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBeCloseTo(2.5);
  });

  it('damp converges towards the target and is dt-monotonic', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 5, 1 / 60);
    expect(v).toBeCloseTo(10, 1);
    // Exponential damping is frame-rate independent: equal total simulated
    // time with different step sizes must converge to the same value.
    let fine = 0;
    for (let i = 0; i < 100; i++) fine = damp(fine, 10, 5, 1 / 60);
    let coarse = 0;
    for (let i = 0; i < 20; i++) coarse = damp(coarse, 10, 5, 1 / 12);
    expect(Math.abs(coarse - fine)).toBeLessThan(1e-6);
    expect(fine).toBeCloseTo(10, 2);
  });

  it('mulberry32 is deterministic and well distributed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 1000).toBeGreaterThan(0.4);
    expect(sum / 1000).toBeLessThan(0.6);
  });
});
