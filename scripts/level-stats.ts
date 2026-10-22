// Plays every level's solution headless and suggests forgiving star targets.
// Usage: npx tsx scripts/level-stats.ts [levelId...]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelData } from '../src/game/Level';
import { toPoint } from '../src/physics/geometry';
import { Simulation } from '../src/physics/Simulation';

const dir = join(import.meta.dirname, '../src/levels');
const only = process.argv.slice(2);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const level = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelData;
  if (only.length && !only.includes(level.id)) continue;
  const sim = new Simulation(level);
  for (const s of level.solution.strokes) sim.addStroke(s.map(toPoint));
  sim.scheduleBoosts(level.solution.boosts ?? []);
  sim.start();
  while (sim.status === 'running' && sim.steps < 60 * 60) sim.step();
  const ink = Math.round(sim.inkUsed);
  const t = sim.elapsedMs / 1000;
  console.log(
    `${level.id.padEnd(7)} ${sim.status.padEnd(8)} ink ${String(ink).padStart(4)}/${sim.inkTotal}  time ${t.toFixed(1)} s  snaps ${sim.snaps}` +
      `  | suggest stars: ink ${Math.ceil((ink * 1.3) / 10) * 10}, time ${Math.ceil(t * 1.3 * 2) / 2} s` +
      `  | current: ink ${level.stars.ink}, time ${level.stars.timeMs / 1000} s`,
  );
}
