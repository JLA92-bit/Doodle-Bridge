import { DAILY } from '../config/scoring';

const DAY_MS = 86_400_000;

/** UTC date as a YYYYMMDD number, e.g. 20261021. Same course worldwide. */
export function dailySeed(date: Date): number {
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/** Whole UTC days since 1970-01-01. */
export function utcDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

/** Daily #1 is 2026-10-21; earlier dates give numbers below 1. */
export function dailyNumber(date: Date): number {
  const first = Date.UTC(DAILY.firstDay.year, DAILY.firstDay.month - 1, DAILY.firstDay.day) / DAY_MS;
  return utcDayIndex(date) - first + 1;
}

/** 1284 -> "1,284" (locale independent). */
export function withCommas(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface DailyShare {
  number: number;
  distance: number;
  snaps: number;
  /** Counted attempts used today. */
  attempts: number;
}

/** "Doodle Bridge Daily #42 - 1,284 m - 3 snaps - best of 3" plus the game link on the next line. */
export function shareText(r: DailyShare): string {
  const snaps = `${r.snaps} ${r.snaps === 1 ? 'snap' : 'snaps'}`;
  return `Doodle Bridge Daily #${r.number} - ${withCommas(r.distance)} m - ${snaps} - best of ${Math.max(1, r.attempts)}\n${DAILY.gameUrl}`;
}

/** Milliseconds until the next daily starts (UTC midnight). Always above 0. */
export function msUntilNextDaily(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/** "5h 12m" or "12m 09s" for the countdown label. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
