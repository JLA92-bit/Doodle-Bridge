import { describe, expect, it } from 'vitest';
import { EndlessSave, endlessUnlocked, type RunResult } from '../../src/game/EndlessSave';
import { SaveStore, type Storage } from '../../src/game/Save';
import type { Replay } from '../../src/endless/types';

const memory = (): Storage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};
const KEY = 'doodle-bridge.endless';
const replay: Replay = { seed: 1, vehicle: 'paperCar', pen: 'pencil', strokes: [], boosts: [], gameVersion: 't' };
const run = (score: number, distance = score / 10, snaps = 0, extra: Partial<RunResult> = {}): RunResult => ({
  score,
  distance,
  snaps,
  trail: [[0, 0], [10, 5]],
  replay,
  vehicle: 'paperCar',
  pen: 'pencil',
  ...extra,
});
const day = (n: number) => new Date(Date.UTC(2026, 9, 21 + n, 12));

describe('endless records', () => {
  it('keeps the best run with its ghost and replay, and persists', () => {
    const storage = memory();
    const s = new EndlessSave(storage);
    expect(s.recordEndless(run(1000, 100, 0, { trail: [[1, 2]] }), day(0)).newBest).toBe(true);
    expect(s.recordEndless(run(500, 50), day(0)).newBest).toBe(false);
    const again = new EndlessSave(storage);
    expect(again.best.score).toBe(1000);
    expect(again.best.trail).toEqual([[1, 2]]);
    expect(again.best.replay).toEqual(replay);
  });

  it('caps the stored trail', () => {
    const s = new EndlessSave(memory());
    const long: [number, number][] = Array.from({ length: 5000 }, (_, i) => [i, i]);
    s.recordEndless(run(10, 1, 0, { trail: long }), day(0));
    expect(s.best.trail.length).toBe(600);
    expect(s.best.trail[0]).toEqual([0, 0]);
    expect(s.best.trail[599]).toEqual([4999, 4999]);
  });

  it('queues personal bests for upload and clears them', () => {
    const s = new EndlessSave(memory());
    s.recordEndless(run(100), day(0));
    s.recordEndless(run(50), day(0));
    expect(s.pending()).toHaveLength(1);
    expect(s.pending()[0]).toMatchObject({ mode: 'endless', seed: 0, score: 100, vehicle: 'paperCar', pen: 'pencil' });
    s.clearPending([...s.pending()]);
    expect(s.pending()).toHaveLength(0);
  });

  it('reports distance milestones once', () => {
    const s = new EndlessSave(memory());
    expect(s.recordEndless(run(10, 499), day(0)).newRewards).toEqual([]);
    expect(s.recordEndless(run(20, 2100), day(0)).newRewards).toEqual([
      'paper-endless500',
      'vehicle-schoolBus',
      'paper-endless2000',
    ]);
    expect(s.recordEndless(run(30, 2200), day(0)).newRewards).toEqual([]);
    expect(s.recordEndless(run(40, 5000), day(0)).newRewards).toEqual(['paper-endless5000']);
    expect(s.data.milestones).toEqual([500, 1000, 2000, 5000]);
  });
});

describe('daily attempts', () => {
  it('counts 3 attempts per day and treats the rest as practice', () => {
    const s = new EndlessSave(memory());
    const t = day(0);
    expect(s.attemptsLeft(t)).toBe(3);
    const a = s.recordDaily(run(300, 30, 2), t);
    expect(a).toMatchObject({ counted: true, attempt: 1, attemptsLeft: 2, newBest: true });
    s.recordDaily(run(900, 90, 4), t);
    const third = s.recordDaily(run(100, 10, 0), t);
    expect(third).toMatchObject({ counted: true, attempt: 3, attemptsLeft: 0, newBest: false });
    const practice = s.recordDaily(run(5000, 500, 0), t);
    expect(practice).toMatchObject({ counted: false, attempt: 0, newBest: false, newRewards: [] });
    const rec = s.dailyRecord(t);
    expect(rec).toMatchObject({ attempts: 3, bestScore: 900, bestDistance: 90, bestSnaps: 4 });
    expect(s.pending().filter((p) => p.mode === 'daily')).toHaveLength(3);
    expect(s.pending()[0]!.seed).toBe(20261021);
  });

  it('starts fresh attempts on the next UTC day', () => {
    const s = new EndlessSave(memory());
    for (let i = 0; i < 3; i++) s.recordDaily(run(100), new Date('2026-10-21T23:00:00Z'));
    expect(s.attemptsLeft(new Date('2026-10-21T23:59:00Z'))).toBe(0);
    expect(s.attemptsLeft(new Date('2026-10-22T00:00:00Z'))).toBe(3);
  });

  it('keeps the ghost trail of the best counted run and a first run of 0 still counts', () => {
    const s = new EndlessSave(memory());
    s.recordDaily(run(0, 0, 1, { trail: [[9, 9]] }), day(0));
    expect(s.dailyRecord(day(0)).trail).toEqual([[9, 9]]);
    s.recordDaily(run(50, 5, 0, { trail: [[1, 1]] }), day(0));
    expect(s.dailyRecord(day(0)).trail).toEqual([[1, 1]]);
  });

  it('prunes old days', () => {
    const s = new EndlessSave(memory());
    s.recordDaily(run(100), day(0));
    s.recordDaily(run(100), day(20));
    expect(Object.keys(s.data.daily)).toEqual(['20261110']);
  });
});

describe('streak', () => {
  it('continues on consecutive UTC days and counts once per day', () => {
    const s = new EndlessSave(memory());
    s.recordDaily(run(1), day(0));
    s.recordDaily(run(1), day(0));
    expect(s.streak(day(0))).toBe(1);
    s.recordDaily(run(1), day(1));
    expect(s.streak(day(1))).toBe(2);
    expect(s.longestStreak()).toBe(2);
  });

  it('breaks after a missed day but keeps the longest', () => {
    const s = new EndlessSave(memory());
    for (let i = 0; i < 3; i++) s.recordDaily(run(1), day(i));
    expect(s.streak(day(3))).toBe(3);
    expect(s.streakAtRisk(day(3))).toBe(true);
    expect(s.streakAtRisk(day(2))).toBe(false);
    expect(s.streak(day(4))).toBe(0);
    s.recordDaily(run(1), day(4));
    expect(s.streak(day(4))).toBe(1);
    expect(s.longestStreak()).toBe(3);
  });

  it('practice runs do not extend the streak', () => {
    const s = new EndlessSave(memory());
    for (let i = 0; i < 4; i++) s.recordDaily(run(1), day(0));
    s.recordDaily(run(1), day(1));
    s.recordDaily(run(1), day(1));
    s.recordDaily(run(1), day(1));
    s.recordDaily(run(1), day(1)); // practice
    expect(s.streak(day(1))).toBe(2);
  });

  it('unlocks rewards at 7 and 30 days exactly once', () => {
    const s = new EndlessSave(memory());
    const out: string[][] = [];
    for (let i = 0; i < 31; i++) out.push(s.recordDaily(run(1), day(i)).newRewards);
    expect(out[5]).toEqual([]);
    expect(out[6]).toEqual(['paper-streak7']);
    expect(out[28]).toEqual([]);
    expect(out[29]).toEqual(['paper-streak30', 'vehicle-unicycle']);
    expect(out[30]).toEqual([]);
    expect(s.hasReward('vehicle-unicycle')).toBe(true);
  });

  it('does not re-award after a break and rebuild', () => {
    const s = new EndlessSave(memory());
    for (let i = 0; i < 7; i++) s.recordDaily(run(1), day(i));
    for (let i = 10; i < 17; i++) expect(s.recordDaily(run(1), day(i)).newRewards).toEqual([]);
  });

  it('survives a reload', () => {
    const storage = memory();
    const s = new EndlessSave(storage);
    s.recordDaily(run(1), day(0));
    s.recordDaily(run(1), day(1));
    expect(new EndlessSave(storage).streak(day(1))).toBe(2);
  });
});

describe('corrupt storage', () => {
  it('starts fresh from invalid JSON', () => {
    const storage = memory();
    storage.setItem(KEY, '{nope');
    const s = new EndlessSave(storage);
    expect(s.best.score).toBe(0);
    expect(s.streak(day(0))).toBe(0);
  });

  it('repairs wrong shapes field by field', () => {
    const storage = memory();
    storage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        best: { score: 'x', distance: 70, trail: [[1, 2], 'bad', [null, 3]], replay: 5 },
        daily: { '20261021': { attempts: 99, bestScore: 5 }, junk: {}, '20261022': 4 },
        streak: { current: -3, longest: 'a', lastDay: 'b' },
        rewards: ['paper-streak7', 4],
        milestones: [500, 'x'],
        pending: [1, { mode: 'daily', score: 1, distance: 2 }, { mode: 'bogus' }],
      }),
    );
    const s = new EndlessSave(storage);
    expect(s.best).toMatchObject({ score: 0, distance: 70, trail: [[1, 2]], replay: null });
    expect(s.attemptsUsed(new Date('2026-10-21T10:00:00Z'))).toBe(3);
    expect(Object.keys(s.data.daily)).toEqual(['20261021']);
    expect(s.streak(day(0))).toBe(0);
    expect(s.data.rewards).toEqual(['paper-streak7']);
    expect(s.data.milestones).toEqual([500]);
    expect(s.pending()).toHaveLength(1);
  });

  it('ignores the wrong version and a throwing store', () => {
    const storage = memory();
    storage.setItem(KEY, JSON.stringify({ version: 9, best: { score: 5 } }));
    expect(new EndlessSave(storage).best.score).toBe(0);
    const broken: Storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const s = new EndlessSave(broken);
    expect(() => s.recordEndless(run(10), day(0))).not.toThrow();
    expect(s.best.score).toBe(10);
  });
});

describe('endless unlock', () => {
  it('opens once campaign level nb1-05 is completed', () => {
    const campaign = new SaveStore(memory());
    expect(endlessUnlocked(campaign)).toBe(false);
    campaign.recordWin('nb1-04', { stars: [true, true, true], score: 1, timeMs: 1, ink: 1 });
    expect(endlessUnlocked(campaign)).toBe(false);
    campaign.recordWin('nb1-05', { stars: [true, false, false], score: 1, timeMs: 1, ink: 1 });
    expect(endlessUnlocked(campaign)).toBe(true);
  });
});
