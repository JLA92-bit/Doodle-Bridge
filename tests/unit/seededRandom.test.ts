import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/endless/SeededRandom';

describe('mulberry32', () => {
  it('gives the same sequence for the same seed', () => {
    const a = mulberry32(20261021);
    const b = mulberry32(20261021);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('stays within [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
