/** Per-level personal bests. */
export interface LevelRecord {
  /** [complete, ink, time] stars ever earned (each kept once earned). */
  stars: [boolean, boolean, boolean];
  bestScore: number;
  bestTimeMs: number | null;
  bestInk: number | null;
  /** Failed attempts, used for hints. */
  fails: number;
}

export interface SaveData {
  version: 1;
  levels: Record<string, LevelRecord>;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'doodle-bridge.save';

export const emptySave = (): SaveData => ({ version: 1, levels: {} });

const emptyRecord = (): LevelRecord => ({ stars: [false, false, false], bestScore: 0, bestTimeMs: null, bestInk: null, fails: 0 });

/** Browser storage when available; a memory store otherwise (private mode, tests). */
function defaultStorage(): Storage {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      ls.setItem(`${KEY}.probe`, '1');
      return ls;
    }
  } catch {
    // Fall through to memory.
  }
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

/** Loads, updates and persists campaign progress. */
export class SaveStore {
  data: SaveData;

  constructor(private readonly storage: Storage = defaultStorage()) {
    this.data = emptySave();
    try {
      const raw = storage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as SaveData) : null;
      if (parsed?.version === 1 && parsed.levels) this.data = parsed;
    } catch {
      // Corrupt save: start fresh rather than crash.
    }
  }

  record(id: string): LevelRecord {
    return this.data.levels[id] ?? emptyRecord();
  }

  completed(id: string): boolean {
    return this.record(id).stars[0];
  }

  starCount(id: string): number {
    return this.record(id).stars.filter(Boolean).length;
  }

  totalStars(): number {
    return Object.keys(this.data.levels).reduce((n, id) => n + this.starCount(id), 0);
  }

  /** Saves a win and reports what improved. */
  recordWin(
    id: string,
    result: { stars: [boolean, boolean, boolean]; score: number; timeMs: number; ink: number },
  ): { newBest: boolean; newStars: number; firstClear: boolean } {
    const prev = this.record(id);
    const stars = prev.stars.map((s, i) => s || result.stars[i]!) as [boolean, boolean, boolean];
    const newStars = stars.filter(Boolean).length - prev.stars.filter(Boolean).length;
    const newBest = result.score > prev.bestScore;
    this.data.levels[id] = {
      ...prev,
      stars,
      bestScore: Math.max(prev.bestScore, result.score),
      bestTimeMs: prev.bestTimeMs === null ? result.timeMs : Math.min(prev.bestTimeMs, result.timeMs),
      bestInk: prev.bestInk === null ? result.ink : Math.min(prev.bestInk, result.ink),
    };
    this.persist();
    return { newBest, newStars, firstClear: !prev.stars[0] };
  }

  recordFail(id: string): number {
    const rec = this.record(id);
    this.data.levels[id] = { ...rec, fails: rec.fails + 1 };
    this.persist();
    return rec.fails + 1;
  }

  private persist(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: progress still holds for this session.
    }
  }
}

let shared: SaveStore | null = null;
export function save(): SaveStore {
  return (shared ??= new SaveStore());
}
