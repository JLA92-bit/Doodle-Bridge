// Plays every level's solution headless and suggests forgiving star targets.
// Usage: npx tsx scripts/level-stats.ts [--jitter] [levelId...]
//   --jitter  also replays 8 variants with each solution point moved up to 5 px and boosts
//             shifted up to 6 steps, to check the level is fair rather than knife-edge.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../src/endless/SeededRandom';
import type { LevelData } from '../src/game/Level';
import { toPoint, type PointTuple } from '../src/physics/geometry';
import { Simulation } from '../src/physics/Simulation';

const dir = join(import.meta.dirname, '../src/levels');
const args = process.argv.slice(2);
const jitter = args.includes('--jitter');
const only = args.filter((a) => !a.startsWith('--'));

function play(level: LevelData, strokes: PointTuple[][], boosts: number[]): Simulation {
  const sim = new Simulation(level);
  for (const s of strokes) sim.addStroke(s.map(toPoint));
  sim.scheduleBoosts(boosts);
  sim.start();
  while (sim.status === 'running' && sim.steps < 60 * 60) sim.step();
  return sim;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const level = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelData;
  if (only.length && !only.includes(level.id)) continue;
  const boosts = level.solution.boosts ?? [];
  const sim = play(level, level.solution.strokes, boosts);
  const ink = Math.round(sim.inkUsed);
  const t = sim.elapsedMs / 1000;
  let line =
    `${level.id.padEnd(7)} ${sim.status.padEnd(8)}${sim.crashReason ? `(${sim.crashReason})` : ''} ink ${String(ink).padStart(4)}/${sim.inkTotal}` +
    `  time ${t.toFixed(1)} s  snaps ${sim.snaps}` +
    `  | suggest stars: ink ${Math.ceil((ink * 1.3) / 10) * 10}, time ${Math.ceil(t * 1.3 * 2) / 2} s` +
    `  | current: ink ${level.stars.ink}, time ${level.stars.timeMs / 1000} s`;
  if (jitter) {
    const rand = mulberry32(7);
    let wins = 0;
    const n = 8;
    for (let v = 0; v < n; v++) {
      const strokes = level.solution.strokes.map((s) =>
        s.map(([x, y], i) => (i === 0 || i === s.length - 1 ? [x, y] : [x + (rand() - 0.5) * 10, y + (rand() - 0.5) * 10]) as PointTuple),
      );
      const b = boosts.map((s) => Math.max(0, s + Math.round((rand() - 0.5) * 12)));
      if (play(level, strokes, b).status === 'won') wins++;
    }
    line += `  | jitter wins ${wins}/${n}`;
  }
  console.log(line);
}
