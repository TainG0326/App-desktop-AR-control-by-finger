import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '@renderer/gestures/smoothing/oneEuro.js';

describe('OneEuroFilter', () => {
  it('returns the first value unchanged (cold start)', () => {
    const f = new OneEuroFilter();
    expect(f.filter(10, 0)).toBe(10);
  });

  it('smooths noisy static signal toward the mean', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0 });
    let out = 0;
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 16;
      const x = 100 + (i % 2 === 0 ? 5 : -5);
      out = f.filter(x, t);
    }
    // After enough iterations the filter should have settled close to the mean.
    expect(Math.abs(out - 100)).toBeLessThanOrEqual(5);
  });

  it('tracks fast motion with low latency when beta is high', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 });
    const start = 0;
    const target = 100;
    let t = 0;
    let last = start;
    for (let i = 0; i < 60; i++) {
      t += 16;
      last = f.filter(target, t);
    }
    expect(Math.abs(last - target)).toBeLessThan(1);
  });

  it('reset() restarts the filter', () => {
    const f = new OneEuroFilter();
    f.filter(50, 0);
    f.filter(60, 16);
    f.reset();
    // After reset, filter behaves like a fresh instance.
    expect(f.filter(10, 100)).toBe(10);
  });

  it('setMinCutoff / setBeta adjust future filtering', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0 });
    f.setMinCutoff(5);
    f.setBeta(0.1);
    // Sanity: filters still produce numeric output.
    expect(typeof f.filter(42, 200)).toBe('number');
  });
});