import { EndlessRun } from '../../src/endless/EndlessRun';
import type { Chunk, GapSpan } from '../../src/endless/types';
import type { PenId } from '../../src/config/pens';
import type { VehicleId } from '../../src/config/vehicles';
import type { Point } from '../../src/physics/geometry';

export interface BotOptions {
  vehicle?: VehicleId;
  pen?: PenId;
  /** Metres to drive before stopping the bot (a crash stops it earlier). */
  maxM?: number;
  /** Hard limit on steps. */
  maxSteps?: number;
  /** How far ahead (px) of a gap the bot starts drawing. */
  look?: number;
  /** Boost before ramps (off by default: boosting onto a bridge loads it hard). */
  boostRamps?: boolean;
  /** Sag of the drawn line as a fraction of its length. */
  sag?: number;
  /** Called after every step. */
  onStep?: (run: EndlessRun) => void;
}

export interface BotResult {
  run: EndlessRun;
  /** Gaps the bot drew a bridge for. */
  gaps: number;
  /** True when the last gap needed more ink than was left (the run ended for lack of ink, not physics). */
  starved: boolean;
}

/** How far a line with a free end reaches onto the ground (px). */
const REST = 70;

/** Height of the ground surface at x (piece whose top edge spans x), or null over a void. */
function groundY(chunks: readonly Chunk[], x: number): number | null {
  for (const c of chunks) {
    for (const t of c.terrain) {
      const [a, b] = [t.points[0]!, t.points[1]!];
      if (x >= a[0] - 0.01 && x <= b[0] + 0.01) {
        return b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      }
    }
  }
  return null;
}

function overPlatform(chunks: readonly Chunk[], x: number): boolean {
  return chunks.some((c) => c.platforms.some((p) => x > p.points[0]![0] && x < p.points[1]![0]));
}

/** A straight (slightly sagging) line sampled like finger input. */
function line(a: Point, b: Point, sag: number): Point[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.round(len / 12));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 4 * sag * len * t * (1 - t) });
  }
  return out;
}

/** Draws the bridges a gap needs: nail to nail over every void, resting on the ground where an edge has no nail. */
function bridge(run: EndlessRun, gap: GapSpan, sag: number): { strokes: number; starved: boolean } {
  const chunks = run.chunks;
  const nails = run.sim.anchors.filter((a) => a.x >= gap.x0 - 2 && a.x <= gap.x1 + 2).sort((p, q) => p.x - q.x);
  const left = nails.find((n) => Math.abs(n.x - gap.x0) < 2);
  const right = [...nails].reverse().find((n) => Math.abs(n.x - gap.x1) < 2);
  const pts: Point[] = nails.filter((n) => n !== left && n !== right);
  const xl = gap.x0 - REST;
  const xr = gap.x1 + REST;
  pts.unshift(left ?? { x: xl, y: (groundY(chunks, xl) ?? 600) - 2 });
  pts.push(right ?? { x: xr, y: (groundY(chunks, xr) ?? 600) - 2 });
  let strokes = 0;
  let need = 0;
  const todo: Point[][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    let void_ = false;
    for (let x = a.x + 3; x < b.x - 3; x += 6) if (groundY(chunks, x) === null && !overPlatform(chunks, x)) void_ = true;
    if (!void_) continue;
    const l = line(a, b, sag);
    todo.push(l);
    need += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const starved = need > run.inkLeft;
  for (const l of todo) if (run.addStroke(l)) strokes++;
  return { strokes, starved };
}

/** Plays an endless run with a simple strategy: bridge each gap when it is near, boost before ramps. */
export function runBot(seed: number, opts: BotOptions = {}): BotResult {
  const run = new EndlessRun(seed, opts.vehicle ?? 'paperCar', opts.pen ?? 'pencil');
  const maxM = opts.maxM ?? 300;
  const maxSteps = opts.maxSteps ?? 60 * 600;
  const look = opts.look ?? 150;
  const sag = opts.sag ?? 0.04;
  const done = new Set<GapSpan>();
  const boosted = new Set<Chunk>();
  let gaps = 0;
  let starved = false;
  while (run.status === 'running' && run.steps < maxSteps && run.distanceM < maxM) {
    const x = run.vehicle.frontWheel.position.x;
    for (const c of run.chunks) {
      if (opts.boostRamps === true && c.type === 'rampGap' && !boosted.has(c) && x > c.gaps[0]!.x0 - 90 && x < c.gaps[0]!.x0) {
        boosted.add(c);
        run.boost();
      }
      for (const g of c.gaps) {
        if (done.has(g) || g.x0 - x > look || g.x1 < x) continue;
        done.add(g);
        gaps++;
        starved = bridge(run, g, sag).starved;
      }
    }
    run.step();
    opts.onStep?.(run);
  }
  return { run, gaps, starved };
}
