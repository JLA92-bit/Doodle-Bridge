import { describe, expect, it } from 'vitest';
import { validateLevel, type LevelData } from '../src/game/Level';
import { toPoint } from '../src/physics/geometry';
import { Simulation } from '../src/physics/Simulation';

const levels = import.meta.glob<LevelData>('../src/levels/*.json', { eager: true, import: 'default' });
const MAX_STEPS = 60 * 60;

function run(level: LevelData, strokes: [number, number][][]): Simulation {
  const sim = new Simulation(level);
  for (const s of strokes) sim.addStroke(s.map(toPoint));
  sim.start();
  while (sim.status === 'running' && sim.steps < MAX_STEPS) sim.step();
  return sim;
}

describe('level solver', () => {
  for (const [path, level] of Object.entries(levels)) {
    describe(path.split('/').pop()!, () => {
      it('is valid', () => {
        expect(validateLevel(level)).toEqual([]);
      });

      it('is beaten by its solution stroke within the ink limit', () => {
        const sim = run(level, level.solution.strokes);
        expect(sim.status).toBe('won');
        expect(sim.inkUsed).toBeLessThanOrEqual(sim.inkTotal);
      });

      it('cannot be beaten with no drawing', () => {
        expect(run(level, []).status).not.toBe('won');
      });
    });
  }
});
