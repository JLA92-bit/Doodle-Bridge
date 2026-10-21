import { CAMPAIGN_SCORE } from '../config/scoring';

export interface StarTargets {
  ink: number;
  timeMs: number;
}

export interface RunResult {
  won: boolean;
  inkUsed: number;
  inkTotal: number;
  timeMs: number;
}

export interface StarRating {
  complete: boolean;
  ink: boolean;
  time: boolean;
  count: number;
}

/** One star for finishing, one for ink at or under target, one for time at or under target. */
export function rateRun(run: RunResult, targets: StarTargets): StarRating {
  const complete = run.won;
  const ink = complete && run.inkUsed <= targets.ink;
  const time = complete && run.timeMs <= targets.timeMs;
  return { complete, ink, time, count: Number(complete) + Number(ink) + Number(time) };
}

export function levelScore(run: RunResult, targets: StarTargets): number {
  if (!run.won) return 0;
  const unusedPct = run.inkTotal > 0 ? Math.max(0, 1 - run.inkUsed / run.inkTotal) * 100 : 0;
  const timeFrac = Math.max(0, 1 - run.timeMs / (targets.timeMs * 2));
  return Math.round(CAMPAIGN_SCORE.base + unusedPct * CAMPAIGN_SCORE.inkPoints + timeFrac * CAMPAIGN_SCORE.timeBonus);
}
