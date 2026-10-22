import { describe, expect, it } from 'vitest';
import { ScoreKeeper } from '../../src/endless/Scoring';
import type { EndlessEvent, GapSpan } from '../../src/endless/types';

const gap: GapSpan = { x0: 0, x1: 100, expectedInk: 200 };
const cross = (clean: boolean, inkUsed = 150): EndlessEvent => ({ type: 'crossing', gap, clean, inkUsed });
const snap: EndlessEvent = { type: 'snap', at: { x: 0, y: 0 } };

describe('endless scoring', () => {
  it('pays 10 points per metre', () => {
    const k = new ScoreKeeper();
    k.update(12.34);
    expect(k.score).toBe(123);
    k.update(100);
    expect(k.score).toBe(1000);
  });

  it('pays the table values at 1.0x', () => {
    const a = new ScoreKeeper();
    a.update(0, [cross(true)]);
    expect(a.score).toBe(100);
    const b = new ScoreKeeper();
    b.update(0, [{ type: 'closeCall', at: { x: 0, y: 0 } }]);
    expect(b.score).toBe(75);
    const c = new ScoreKeeper();
    c.update(0, [{ type: 'inkPot', at: { x: 0, y: 0 }, airborne: true }]);
    expect(c.score).toBe(25);
  });

  it('adds thrifty on top of clean when under half the expected ink', () => {
    const k = new ScoreKeeper();
    k.update(0, [cross(true, 99)]);
    expect(k.score).toBe(250);
    expect(k.popups.map((p) => p.text)).toEqual(['Clean! +100', 'Thrifty! +150', 'x1.1']);
    const exact = new ScoreKeeper();
    exact.update(0, [cross(true, 100)]);
    expect(exact.score).toBe(100);
  });

  it('pays no crossing bonus for an unclean crossing and keeps the combo', () => {
    const k = new ScoreKeeper();
    k.update(0, [cross(true), cross(false, 10)]);
    expect(k.score).toBe(100);
    expect(k.crossings).toBe(2);
    expect(k.cleanCrossings).toBe(1);
    expect(k.multiplier).toBeCloseTo(1.1);
  });

  it('raises the multiplier by 0.1 per clean crossing and caps at 3.0', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 5; i++) k.update(0, [cross(true)]);
    expect(k.multiplier).toBeCloseTo(1.5, 5);
    for (let i = 0; i < 40; i++) k.update(0, [cross(true)]);
    expect(k.multiplier).toBe(3);
  });

  it('applies the multiplier at the moment points are earned', () => {
    const k = new ScoreKeeper();
    k.update(0, [cross(true)]); // +100 at 1.0, then 1.1x
    k.update(10); // 100 m points x 1.1 = 110
    expect(k.score).toBe(210);
    k.update(10, [{ type: 'closeCall', at: { x: 0, y: 0 } }]); // 75 x 1.1 = 82.5
    expect(k.bonusTotal).toBeCloseTo(182.5);
    expect(k.score).toBe(292);
  });

  it('resets the multiplier on a snap without touching earned points', () => {
    const k = new ScoreKeeper();
    k.update(0, [cross(true), cross(true)]);
    expect(k.multiplier).toBeCloseTo(1.2);
    const before = k.score;
    k.update(0, [snap]);
    expect(k.multiplier).toBe(1);
    expect(k.snaps).toBe(1);
    expect(k.score).toBe(before);
    k.update(0, [{ type: 'inkPot', at: { x: 0, y: 0 }, airborne: false }]);
    expect(k.score).toBe(before + 25);
  });

  it('pays big air per full 0.5 s only', () => {
    const pay = (ms: number) => {
      const k = new ScoreKeeper();
      k.update(0, [{ type: 'air', ms }]);
      return k;
    };
    expect(pay(499).score).toBe(0);
    expect(pay(499).popups).toHaveLength(0);
    expect(pay(500).score).toBe(50);
    expect(pay(999).score).toBe(50);
    expect(pay(1000).score).toBe(100);
    expect(pay(1600).popups[0]).toEqual({ text: 'Big air! +150', points: 150, kind: 'air' });
  });

  it('ignores unrelated events and a distance that goes backwards', () => {
    const k = new ScoreKeeper();
    k.update(10, [{ type: 'tier', tier: 1 }, { type: 'boost' }]);
    k.update(5);
    expect(k.score).toBe(100);
  });

  it('takePopups drains the queue', () => {
    const k = new ScoreKeeper();
    k.update(0, [{ type: 'closeCall', at: { x: 0, y: 0 } }]);
    expect(k.takePopups()).toEqual([{ text: 'Close call! +75', points: 75, kind: 'closeCall' }]);
    expect(k.popups).toEqual([]);
  });
});
