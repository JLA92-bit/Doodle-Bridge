import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { BOOST, CRASH, STEP_MS } from '../../src/config/world';
import type { LevelData } from '../../src/game/Level';
import { updateBreaks } from '../../src/physics/BreakSystem';
import { toPoint } from '../../src/physics/geometry';
import { Simulation } from '../../src/physics/Simulation';

/** Flat ground across the screen, with an optional wall. */
function flatLevel(wall = false): LevelData {
  const terrain: LevelData['terrain'] = [{ points: [[0, 600], [480, 600], [480, 854], [0, 854]] }];
  if (wall) terrain.push({ points: [[200, 450], [240, 450], [240, 600], [200, 600]] });
  return {
    id: 'flat', name: 'Flat', notebook: 0, index: 0, terrain, anchors: [[100, 400], [300, 400]],
    start: [60, 599], flag: { x: 460, y: 500, w: 20, h: 100 }, ink: 1000, stars: { ink: 100, timeMs: 5000 },
    solution: { strokes: [[[0, 0], [10, 0]]] },
  };
}

function runUntilDone(sim: Simulation, maxSteps = 60 * 30): void {
  sim.start();
  while (sim.status === 'running' && sim.steps < maxSteps) sim.step();
}

describe('breaking', () => {
  it('snaps a joint pulled apart for several steps and splits the line in two', () => {
    const sim = new Simulation(flatLevel());
    const chain = sim.addStroke([toPoint([100, 400]), toPoint([300, 400])])!;
    expect(chain.runs()).toHaveLength(1);
    const middle = chain.segments[Math.floor(chain.segments.length / 2)]!;
    let snapped = 0;
    for (let i = 0; i < 6; i++) {
      Matter.Body.setPosition(middle, { x: middle.position.x, y: 430 });
      snapped += updateBreaks(sim.strokes).length;
    }
    expect(snapped).toBeGreaterThan(0);
    expect(chain.runs().length).toBeGreaterThan(1);
  });

  it('does not snap a relaxed line', () => {
    const sim = new Simulation(flatLevel());
    sim.addStroke([toPoint([100, 400]), toPoint([300, 400])]);
    for (let i = 0; i < 20; i++) expect(updateBreaks(sim.strokes)).toHaveLength(0);
  });
});

describe('crash rules', () => {
  it('crashes when the vehicle falls off the bottom', () => {
    const level = flatLevel();
    level.terrain = [{ points: [[0, 600], [120, 600], [120, 854], [0, 854]] }];
    const sim = new Simulation(level);
    runUntilDone(sim);
    expect(sim.status).toBe('crashed');
    expect(sim.crashReason).toBe('fell');
  });

  it('crashes when flipped upside down', () => {
    const sim = new Simulation(flatLevel());
    sim.vehicle.motorOn = false;
    // Matter supports rotating around a point; the bundled types only list two arguments.
    const rotate = Matter.Body.rotate as (b: Matter.Body, angle: number, point: Matter.Vector) => void;
    const pivot = { ...sim.vehicle.chassis.position };
    Matter.Composite.allBodies(sim.vehicle.composite).forEach((b) => rotate(b, Math.PI, pivot));
    sim.start();
    sim.vehicle.motorOn = false;
    while (sim.status === 'running' && sim.steps < 600) sim.step();
    expect(sim.crashReason).toBe('flipped');
    expect(sim.steps).toBeGreaterThanOrEqual(CRASH.flippedMs / STEP_MS);
  });

  it('crashes as stalled when stuck behind a wall', () => {
    const sim = new Simulation(flatLevel(true));
    runUntilDone(sim);
    expect(sim.crashReason).toBe('stalled');
  });

  it('wins on reaching the flag', () => {
    const sim = new Simulation(flatLevel());
    runUntilDone(sim);
    expect(sim.status).toBe('won');
  });
});

describe('boost', () => {
  it('has a cooldown and records boosts', () => {
    const sim = new Simulation(flatLevel());
    expect(sim.boost()).toBe(false);
    sim.start();
    expect(sim.boost()).toBe(true);
    expect(sim.boosting).toBe(true);
    expect(sim.boost()).toBe(false);
    while (sim.boostCooldown > 0 && sim.status === 'running') sim.step();
    expect(sim.steps).toBeGreaterThanOrEqual(Math.round(BOOST.cooldownMs / STEP_MS) - 1);
    expect(sim.boost()).toBe(true);
    expect(sim.boosts).toHaveLength(2);
  });

  it('makes the vehicle faster', () => {
    const plain = new Simulation(flatLevel());
    plain.start();
    const boosted = new Simulation(flatLevel());
    boosted.scheduleBoosts([0, 90]);
    boosted.start();
    for (let i = 0; i < 120; i++) {
      plain.step();
      boosted.step();
    }
    expect(boosted.vehicle.position.x).toBeGreaterThan(plain.vehicle.position.x + 10);
  });

  it('replays identically (deterministic)', () => {
    const a = new Simulation(flatLevel(true));
    const b = new Simulation(flatLevel(true));
    for (const s of [a, b]) {
      s.scheduleBoosts([10, 120]);
      s.start();
      for (let i = 0; i < 300; i++) s.step();
    }
    expect(a.vehicle.position).toEqual(b.vehicle.position);
  });
});
