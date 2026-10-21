import { describe, expect, it } from 'vitest';
import { levelScore, rateRun } from '../../src/game/StarRules';

const targets = { ink: 200, timeMs: 5000 };

describe('star rules', () => {
  it('gives no stars for a crash', () => {
    expect(rateRun({ won: false, inkUsed: 10, inkTotal: 600, timeMs: 1000 }, targets).count).toBe(0);
  });

  it('gives one star for any completion', () => {
    const r = rateRun({ won: true, inkUsed: 500, inkTotal: 600, timeMs: 9000 }, targets);
    expect(r).toEqual({ complete: true, ink: false, time: false, count: 1 });
  });

  it('gives ink and time stars at or under target', () => {
    expect(rateRun({ won: true, inkUsed: 200, inkTotal: 600, timeMs: 5000 }, targets).count).toBe(3);
    expect(rateRun({ won: true, inkUsed: 150, inkTotal: 600, timeMs: 6000 }, targets)).toMatchObject({ ink: true, time: false, count: 2 });
  });
});

describe('level score', () => {
  it('is zero when the level is not finished', () => {
    expect(levelScore({ won: false, inkUsed: 0, inkTotal: 600, timeMs: 0 }, targets)).toBe(0);
  });

  it('rewards unused ink and speed', () => {
    const slowWasteful = levelScore({ won: true, inkUsed: 600, inkTotal: 600, timeMs: 10000 }, targets);
    const fastThrifty = levelScore({ won: true, inkUsed: 150, inkTotal: 600, timeMs: 3000 }, targets);
    expect(slowWasteful).toBe(1000);
    expect(fastThrifty).toBe(1000 + 75 * 20 + 350);
  });
});
