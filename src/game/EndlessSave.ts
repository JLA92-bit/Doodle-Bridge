import type { PenId } from '../config/pens';
import { DAILY, ENDLESS_REWARDS as R } from '../config/scoring';
import type { VehicleId } from '../config/vehicles';
import { dailySeed, utcDayIndex } from '../endless/Daily';
import type { Replay } from '../endless/types';
import type { PointTuple } from '../physics/geometry';
import type { SaveStore, Storage } from './Save';

export interface EndlessBest {
  score: number;
  distance: number;
  /** Ghost of the best run. */
  trail: PointTuple[];
  replay: Replay | null;
}

export interface DailyRecord {
  /** Counted attempts used (max DAILY.countedAttempts). */
  attempts: number;
  bestScore: number;
  bestDistance: number;
  /** Snaps in the best counted run. */
  bestSnaps: number;
  trail: PointTuple[];
}

export interface StreakData {
  current: number;
  longest: number;
  /** UTC day index of the last counted daily attempt, or null. */
  lastDay: number | null;
}

export interface PendingScore {
  mode: 'endless' | 'daily';
  /** Daily seed, or 0 for endless. */
  seed: number;
  score: number;
  distance: number;
  vehicle: VehicleId;
  pen: PenId;
  replay: Replay | null;
  /** ISO time. */
  createdAt: string;
}

export interface EndlessData {
  version: 1;
  best: EndlessBest;
  /** Keyed by daily seed (YYYYMMDD). */
  daily: Record<string, DailyRecord>;
  streak: StreakData;
  /** Reward ids unlocked through streaks and milestones. */
  rewards: string[];
  /** Milestone distances reached. */
  milestones: number[];
  pending: PendingScore[];
}

export interface RunResult {
  score: number;
  distance: number;
  snaps: number;
  trail: readonly PointTuple[];
  replay: Replay | null;
  vehicle: VehicleId;
  pen: PenId;
}

const KEY = 'doodle-bridge.endless';

const emptyBest = (): EndlessBest => ({ score: 0, distance: 0, trail: [], replay: null });
const emptyDaily = (): DailyRecord => ({ attempts: 0, bestScore: 0, bestDistance: 0, bestSnaps: 0, trail: [] });
export const emptyEndless = (): EndlessData => ({
  version: 1,
  best: emptyBest(),
  daily: {},
  streak: { current: 0, longest: 0, lastDay: null },
  rewards: [],
  milestones: [],
  pending: [],
});

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

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const cleanTrail = (v: unknown): PointTuple[] => {
  if (!Array.isArray(v)) return [];
  const out: PointTuple[] = [];
  for (const p of v) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push([p[0], p[1]]);
    }
  }
  return capTrail(out);
};

const cleanReplay = (v: unknown): Replay | null =>
  isObj(v) && typeof v.seed === 'number' && Array.isArray(v.strokes) && Array.isArray(v.boosts) ? (v as unknown as Replay) : null;

/** Keeps at most trailCap points, evenly spread, always including the last. */
export function capTrail(trail: readonly PointTuple[]): PointTuple[] {
  const cap = R.trailCap;
  const round = (p: PointTuple): PointTuple => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
  if (trail.length <= cap) return trail.map(round);
  const out: PointTuple[] = [];
  for (let i = 0; i < cap; i++) out.push(round(trail[Math.round((i * (trail.length - 1)) / (cap - 1))]!));
  return out;
}

function sanitize(raw: unknown): EndlessData {
  const d = emptyEndless();
  if (!isObj(raw) || raw.version !== 1) return d;
  if (isObj(raw.best)) {
    d.best = {
      score: num(raw.best.score),
      distance: num(raw.best.distance),
      trail: cleanTrail(raw.best.trail),
      replay: cleanReplay(raw.best.replay),
    };
  }
  if (isObj(raw.daily)) {
    for (const [seed, r] of Object.entries(raw.daily)) {
      if (!/^\d{8}$/.test(seed) || !isObj(r)) continue;
      d.daily[seed] = {
        attempts: Math.min(DAILY.countedAttempts, Math.floor(num(r.attempts))),
        bestScore: num(r.bestScore),
        bestDistance: num(r.bestDistance),
        bestSnaps: Math.floor(num(r.bestSnaps)),
        trail: cleanTrail(r.trail),
      };
    }
  }
  if (isObj(raw.streak)) {
    const last = raw.streak.lastDay;
    d.streak = {
      current: Math.floor(num(raw.streak.current)),
      longest: Math.floor(num(raw.streak.longest)),
      lastDay: typeof last === 'number' && Number.isFinite(last) ? last : null,
    };
    d.streak.longest = Math.max(d.streak.longest, d.streak.current);
  }
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  d.rewards = strings(raw.rewards);
  d.milestones = Array.isArray(raw.milestones) ? raw.milestones.filter((x): x is number => typeof x === 'number') : [];
  if (Array.isArray(raw.pending)) {
    d.pending = raw.pending
      .filter(
        (p): p is PendingScore =>
          isObj(p) && (p.mode === 'endless' || p.mode === 'daily') && typeof p.score === 'number' && typeof p.distance === 'number',
      )
      .slice(-R.pendingCap);
  }
  return d;
}

export interface EndlessOutcome {
  newBest: boolean;
  /** Reward ids unlocked by this run (milestones). */
  newRewards: string[];
}

export interface DailyOutcome {
  /** False for practice runs after the counted attempts are used. */
  counted: boolean;
  /** Which counted attempt this was (1 to 3), or 0 for practice. */
  attempt: number;
  /** Counted attempts left today after this run. */
  attemptsLeft: number;
  newBest: boolean;
  streak: number;
  /** Reward ids unlocked by the streak with this run. */
  newRewards: string[];
}

/** Persistent endless and daily records. All dates come from the injected `now`. */
export class EndlessSave {
  data: EndlessData;

  constructor(private readonly storage: Storage = defaultStorage()) {
    this.data = emptyEndless();
    try {
      const raw = storage.getItem(KEY);
      if (raw) this.data = sanitize(JSON.parse(raw));
    } catch {
      // Corrupt save: start fresh rather than crash.
    }
  }

  /** Endless mode opens once campaign level nb1-05 is completed. */
  static unlocked(campaign: Pick<SaveStore, 'completed'>): boolean {
    return campaign.completed(R.unlockLevel);
  }

  get best(): EndlessBest {
    return this.data.best;
  }

  hasReward(id: string): boolean {
    return this.data.rewards.includes(id);
  }

  /** Records an endless run. Queues the score for upload when it is a new personal best. */
  recordEndless(run: RunResult, now: Date): EndlessOutcome {
    const newBest = run.score > this.data.best.score;
    if (newBest) {
      this.data.best = { score: run.score, distance: run.distance, trail: capTrail(run.trail), replay: run.replay };
      this.enqueue({ mode: 'endless', seed: 0, ...this.upload(run), createdAt: now.toISOString() });
    } else if (run.distance > this.data.best.distance) {
      // Distance record without a score record: keep the ghost of the score best.
      this.data.best.distance = run.distance;
    }
    const newRewards: string[] = [];
    for (const m of R.milestones) {
      if (run.distance >= m.meters && !this.data.milestones.includes(m.meters)) {
        this.data.milestones.push(m.meters);
        this.grant(m.reward, newRewards);
      }
    }
    this.persist();
    return { newBest, newRewards };
  }

  /** Counted attempts used on the day of `now`. */
  attemptsUsed(now: Date): number {
    return this.data.daily[String(dailySeed(now))]?.attempts ?? 0;
  }

  attemptsLeft(now: Date): number {
    return Math.max(0, DAILY.countedAttempts - this.attemptsUsed(now));
  }

  dailyRecord(now: Date): DailyRecord {
    return this.data.daily[String(dailySeed(now))] ?? emptyDaily();
  }

  /** Records a daily run: the first 3 of the UTC day count, later ones are practice. */
  recordDaily(run: RunResult, now: Date): DailyOutcome {
    const seed = dailySeed(now);
    const key = String(seed);
    const rec = this.data.daily[key] ?? emptyDaily();
    if (rec.attempts >= DAILY.countedAttempts) {
      return { counted: false, attempt: 0, attemptsLeft: 0, newBest: false, streak: this.streak(now), newRewards: [] };
    }
    rec.attempts++;
    // First counted attempt always sets the record, even with a score of 0.
    const newBest = rec.attempts === 1 || run.score > rec.bestScore;
    if (newBest) {
      rec.bestScore = run.score;
      rec.bestDistance = run.distance;
      rec.bestSnaps = run.snaps;
      rec.trail = capTrail(run.trail);
    }
    this.data.daily[key] = rec;
    this.enqueue({ mode: 'daily', seed, ...this.upload(run), createdAt: now.toISOString() });
    this.prune(now);
    const newRewards = this.extendStreak(now);
    this.persist();
    return {
      counted: true,
      attempt: rec.attempts,
      attemptsLeft: DAILY.countedAttempts - rec.attempts,
      newBest,
      streak: this.data.streak.current,
      newRewards,
    };
  }

  /** The streak as it stands at `now`: 0 once a whole UTC day has been missed. */
  streak(now: Date): number {
    const { current, lastDay } = this.data.streak;
    if (lastDay === null) return 0;
    return utcDayIndex(now) - lastDay <= 1 ? current : 0;
  }

  longestStreak(): number {
    return this.data.streak.longest;
  }

  /** True when today's streak day is still open (no counted attempt yet today). */
  streakAtRisk(now: Date): boolean {
    const { lastDay } = this.data.streak;
    return lastDay !== null && this.streak(now) > 0 && lastDay < utcDayIndex(now);
  }

  pending(): readonly PendingScore[] {
    return this.data.pending;
  }

  /** Removes uploaded scores (matched by identity of createdAt + mode + seed + score). */
  clearPending(done: readonly PendingScore[]): void {
    const same = (a: PendingScore, b: PendingScore) =>
      a.createdAt === b.createdAt && a.mode === b.mode && a.seed === b.seed && a.score === b.score;
    this.data.pending = this.data.pending.filter((p) => !done.some((d) => same(p, d)));
    this.persist();
  }

  private upload(run: RunResult) {
    return { score: run.score, distance: run.distance, vehicle: run.vehicle, pen: run.pen, replay: run.replay };
  }

  private enqueue(p: PendingScore): void {
    this.data.pending.push(p);
    if (this.data.pending.length > R.pendingCap) this.data.pending.splice(0, this.data.pending.length - R.pendingCap);
  }

  private prune(now: Date): void {
    const cutoff = dailySeed(new Date(now.getTime() - DAILY.keepDays * 86_400_000));
    for (const k of Object.keys(this.data.daily)) if (Number(k) < cutoff) delete this.data.daily[k];
  }

  private extendStreak(now: Date): string[] {
    const s = this.data.streak;
    const today = utcDayIndex(now);
    if (s.lastDay === today) return [];
    s.current = s.lastDay !== null && today - s.lastDay === 1 ? s.current + 1 : 1;
    s.lastDay = today;
    s.longest = Math.max(s.longest, s.current);
    const out: string[] = [];
    for (const r of R.streak) if (s.current >= r.days) this.grant(r.reward, out);
    return out;
  }

  private grant(id: string, out: string[]): void {
    if (this.data.rewards.includes(id)) return;
    this.data.rewards.push(id);
    out.push(id);
  }

  private persist(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: progress still holds for this session.
    }
  }
}

let shared: EndlessSave | null = null;
export function endlessSave(): EndlessSave {
  return (shared ??= new EndlessSave());
}

/** Endless mode is open once campaign level nb1-05 is done. */
export const endlessUnlocked = (campaign: Pick<SaveStore, 'completed'>): boolean => EndlessSave.unlocked(campaign);
