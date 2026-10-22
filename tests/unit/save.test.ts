import { describe, expect, it } from 'vitest';
import { levelId } from '../../src/config/notebooks';
import { levelUnlocked, notebookStars, notebookUnlocked } from '../../src/game/Progress';
import { SaveStore, type Storage } from '../../src/game/Save';

const memory = (): Storage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

const win = (stars: [boolean, boolean, boolean], score = 1000) => ({ stars, score, timeMs: 5000, ink: 200 });

describe('save store', () => {
  it('keeps the best of each stat and never loses a star', () => {
    const s = new SaveStore(memory());
    expect(s.recordWin('nb1-01', win([true, true, false], 1500))).toEqual({ newBest: true, newStars: 2, firstClear: true });
    expect(s.recordWin('nb1-01', win([true, false, true], 1200))).toEqual({ newBest: false, newStars: 1, firstClear: false });
    expect(s.record('nb1-01').stars).toEqual([true, true, true]);
    expect(s.record('nb1-01').bestScore).toBe(1500);
    expect(s.totalStars()).toBe(3);
  });

  it('persists and reloads', () => {
    const storage = memory();
    new SaveStore(storage).recordWin('nb1-02', win([true, false, false]));
    expect(new SaveStore(storage).completed('nb1-02')).toBe(true);
  });

  it('survives a corrupt save', () => {
    const storage = memory();
    storage.setItem('doodle-bridge.save', '{not json');
    expect(new SaveStore(storage).totalStars()).toBe(0);
  });

  it('counts fails', () => {
    const s = new SaveStore(memory());
    s.recordFail('nb1-01');
    expect(s.recordFail('nb1-01')).toBe(2);
  });
});

describe('unlock rules', () => {
  it('opens notebook 1 at the start and later notebooks by total stars', () => {
    const s = new SaveStore(memory());
    expect(notebookUnlocked(s, 1)).toBe(true);
    expect(notebookUnlocked(s, 2)).toBe(false);
    for (let i = 1; i <= 4; i++) s.recordWin(levelId(1, i), win([true, true, true]));
    expect(s.totalStars()).toBe(12);
    expect(notebookUnlocked(s, 2)).toBe(true);
    expect(notebookUnlocked(s, 3)).toBe(false);
  });

  it('opens levels in order, with 8 and 9 optional before the boss', () => {
    const s = new SaveStore(memory());
    expect(levelUnlocked(s, 1, 1)).toBe(true);
    expect(levelUnlocked(s, 1, 2)).toBe(false);
    for (let i = 1; i <= 7; i++) s.recordWin(levelId(1, i), win([true, false, false]));
    expect(levelUnlocked(s, 1, 8)).toBe(true);
    expect(levelUnlocked(s, 1, 9)).toBe(false);
    expect(levelUnlocked(s, 1, 10)).toBe(true);
    expect(notebookStars(s, 1)).toBe(7);
  });

  it('keeps levels of a locked notebook locked', () => {
    expect(levelUnlocked(new SaveStore(memory()), 3, 1)).toBe(false);
  });
});
